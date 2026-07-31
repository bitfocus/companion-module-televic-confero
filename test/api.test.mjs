import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import TelevicApi, { TelevicApiError, optionsForMode } from '../dist/api.js'
import { dbToGain, desks, devicesOnline, gainToDb } from '../dist/state.js'

const TOKEN = 'test-token'

/**
 * Payloads here mirror what a real D-Cerno AE returned on firmware >= 1.3:
 * seats carry seatNumber and role, and gains are in units of 0.1 dB.
 */
function startServer(handler) {
	return new Promise((resolve) => {
		const requests = []
		const server = http.createServer((req, res) => {
			let body = ''
			req.on('data', (chunk) => (body += chunk))
			req.on('end', () => {
				requests.push({ method: req.method, url: req.url, headers: req.headers, body })
				handler(req, res, body)
			})
		})
		server.listen(0, '127.0.0.1', () => {
			resolve({ server, requests, port: server.address().port })
		})
	})
}

function apiFor(port, timeout = 2000) {
	return new TelevicApi({
		host: '127.0.0.1',
		port,
		token: TOKEN,
		useHttps: false,
		allowSelfSigned: false,
		timeout,
	})
}

function json(res, status, payload) {
	res.writeHead(status, { 'Content-Type': 'application/json' })
	res.end(JSON.stringify(payload))
}

test('reads the whole room in one call and sends the bearer token', async () => {
	const { server, requests, port } = await startServer((req, res) => {
		json(res, 200, [
			{ seatNumber: 1, role: 'delegate', microphoneOn: false, requestingToSpeak: false },
			{ seatNumber: 2, role: 'chairperson', microphoneOn: true, requestingToSpeak: false },
		])
	})
	try {
		const seats = await apiFor(port).getSeats()
		assert.equal(seats.length, 2)
		assert.equal(seats[1].role, 'chairperson')
		assert.equal(seats[1].microphoneOn, true)
		assert.equal(requests[0].url, '/api/discussion/seats')
		assert.equal(requests[0].headers.authorization, `Bearer ${TOKEN}`)
	} finally {
		server.close()
	}
})

test('a microphone change never clears a pending request to speak', async () => {
	const { server, requests, port } = await startServer((req, res) => {
		res.writeHead(204)
		res.end()
	})
	try {
		await apiFor(port).setSeat(3, { microphoneOn: true })
		assert.equal(requests[0].method, 'PUT')
		assert.equal(requests[0].url, '/api/discussion/seats/3')
		assert.deepEqual(JSON.parse(requests[0].body), { microphoneOn: true })
	} finally {
		server.close()
	}
})

test('volumes are sent in units of 0.1 dB', async () => {
	const { server, requests, port } = await startServer((req, res) => {
		if (req.method === 'GET') return json(res, 200, { gain: -140 })
		res.writeHead(204)
		res.end()
	})
	try {
		const api = apiFor(port)
		assert.equal(await api.getLoudspeakerVolume(), -140)
		assert.equal(gainToDb(-140), -14)

		await api.setLoudspeakerVolume(dbToGain(-4))
		assert.deepEqual(JSON.parse(requests[1].body), { gain: -40 })
	} finally {
		server.close()
	}
})

test('204 responses resolve without a body', async () => {
	const { server, port } = await startServer((req, res) => {
		res.writeHead(204)
		res.end()
	})
	try {
		await apiFor(port).clearSpeakers()
	} finally {
		server.close()
	}
})

test('a rejected token is reported as an auth error', async () => {
	const { server, port } = await startServer((req, res) => {
		res.writeHead(401)
		res.end()
	})
	try {
		await assert.rejects(
			() => apiFor(port).getSeats(),
			(e) => e instanceof TelevicApiError && e.kind === 'auth' && e.status === 401,
		)
	} finally {
		server.close()
	}
})

test('a missing endpoint is reported as notfound so the module can fall back', async () => {
	const { server, port } = await startServer((req, res) => {
		res.writeHead(404)
		res.end()
	})
	try {
		await assert.rejects(
			() => apiFor(port).getSeats(),
			(e) => e instanceof TelevicApiError && e.kind === 'notfound',
		)
	} finally {
		server.close()
	}
})

test('a hanging unit is reported as a timeout, not a hang', async () => {
	const { server, port } = await startServer(() => {
		// never answers
	})
	try {
		await assert.rejects(
			() => apiFor(port, 300).getSeats(),
			(e) => e instanceof TelevicApiError && e.kind === 'timeout',
		)
	} finally {
		server.close()
	}
})

test('a closed port is reported as a refused connection', async () => {
	const { server, port } = await startServer(() => {})
	await new Promise((resolve) => server.close(resolve))
	await assert.rejects(
		() => apiFor(port, 1000).getSeats(),
		(e) => e instanceof TelevicApiError && e.kind === 'refused',
	)
})

test('the long poll passes minimum-id and the module filter', async () => {
	const { server, requests, port } = await startServer((req, res) => {
		json(res, 200, { discontinuity: false, id: 7, module: 'Discussion', name: 'SpeakersChanged' })
	})
	try {
		const event = await apiFor(port).getNextEvent(7, ['Discussion', 'Audio'], 1000)
		assert.equal(event.id, 7)
		assert.match(requests[0].url, /minimum-id=7/)
		assert.match(requests[0].url, /include-filter=Discussion%2CAudio/)
	} finally {
		server.close()
	}
})

test('mode options are rebuilt for the target mode, not carried over', () => {
	// What the unit actually reports while in operator mode.
	const operator = { ledColorOn: 'red', ledColorOff: 'off' }

	const direct = optionsForMode('directSpeak', operator)
	assert.deepEqual(Object.keys(direct).sort(), [
		'ledColorOff',
		'ledColorOn',
		'microphoneActivationType',
		'speakerOverrideAllowed',
		'switchOffAllowed',
	])
	assert.equal(direct.ledColorOn, 'red', 'colours already set on the unit are kept')

	const request = optionsForMode('request', operator)
	assert.deepEqual(Object.keys(request).sort(), [
		'cancelRequestAllowed',
		'ledColorOff',
		'ledColorOn',
		'ledColorRequest',
		'nextInLineIndication',
		'switchOffAllowed',
	])
	// 'off' is not a legal value for ledColorRequest in request mode.
	assert.notEqual(optionsForMode('request', { ledColorRequest: 'off' }).ledColorRequest, 'off')

	assert.deepEqual(Object.keys(optionsForMode('operator', operator)).sort(), ['ledColorOff', 'ledColorOn'])
	assert.equal(optionsForMode('group', operator, 'vox').microphoneActivationType, 'vox')
	// vox exists in group mode only, so direct speak falls back to toggle.
	assert.equal(optionsForMode('directSpeak', operator, 'vox').microphoneActivationType, 'toggle')
	assert.equal(optionsForMode('handsFree', operator).pushToMute, true)
})

test('the central unit is excluded from the desk counts', () => {
	// Shape returned by a real AE: the central unit sits in the same device list.
	const state = {
		devices: [
			{ serial: '14306AA5', state: 'online', deviceType: 'dcernoDelegateUnitSL' },
			{ serial: '14306AA7', state: 'online', deviceType: 'dcernoDelegateUnitSL' },
			{ serial: '1430705A', state: 'online', deviceType: 'dcernoDelegateUnitSL' },
			{ serial: '1801067B', state: 'online', deviceType: 'dcernoCentralUnit2' },
			{ serial: '14305C0E', state: 'offline', deviceType: 'dcernoDelegateUnitSL' },
		],
	}
	assert.equal(devicesOnline(state), 3, 'three desks online, not four')
	assert.equal(desks(state).length, 4, 'the central unit is not a desk')
})

test('an empty body on a 200 does not throw', async () => {
	const { server, port } = await startServer((req, res) => {
		res.writeHead(200, { 'Content-Type': 'application/json' })
		res.end()
	})
	try {
		assert.equal(await apiFor(port).getInputSensitivityOffset(1), undefined)
	} finally {
		server.close()
	}
})
