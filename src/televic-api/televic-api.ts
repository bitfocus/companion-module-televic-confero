import fetch, { HeadersInit, Response } from 'node-fetch'

class HTTPResponseError extends Error {
	response: any
	constructor(response: Response) {
		super(`HTTP Error Response: ${response.status} ${response.statusText}`)
		this.response = response
	}
}

export interface TelevicMicStatusResponse {
	microphoneOn: boolean
	requestingToSpeak: boolean
}

export interface TelevicRecordingResponse {
	state: string
}

export interface TelevicVolumeResponse {
	gain: number
}

export interface TelevicSensitivityResponse {
	input_sensitivity_offset: number
}

export default class TelevicApi {
	private _host: string
	private _port: number
	private _token: string
	private _defaultHeaders: HeadersInit

	constructor(host: string, port: number, token: string) {
		this._host = host
		this._port = port
		this._token = token
		this._defaultHeaders = {
			Accept: 'application/json',
			Authorization: `Bearer ${this._token}`,
		}
	}

	private checkStatus(response: Response) {
		if (response.ok) {
			// response.status >= 200 && response.status < 300
			return response
		} else {
			throw new HTTPResponseError(response)
		}
	}
	public async GetSeat(seatNbr: number): Promise<boolean> {
		const url = `http://${this._host}:${this._port}/api/discussion/seats/${seatNbr}`
		const response = await fetch(url, {
			method: 'get',
			headers: this._defaultHeaders,
		})
		this.checkStatus(response)
		const data = (await response.json()) as TelevicMicStatusResponse
		return data.microphoneOn
	}

	public async GetRequestSeat(seatNbr: number): Promise<boolean> {
		const url = `http://${this._host}:${this._port}/api/discussion/seats/${seatNbr}`
		const response = await fetch(url, {
			method: 'get',
			headers: this._defaultHeaders,
		})
		this.checkStatus(response)
		const data = (await response.json()) as TelevicMicStatusResponse
		return data.requestingToSpeak
	}

	public async SetSeat(seatNbr: number, state: boolean, request: boolean): Promise<Response> {
		const url = `http://${this._host}:${this._port}/api/discussion/seats/${seatNbr}`
		const response = await fetch(url, {
			method: 'put',
			headers: this._defaultHeaders,
			body: JSON.stringify({ microphoneOn: state, requestingToSpeak: request }),
		})
		return this.checkStatus(response)
	}

	public async StartLocalMeeting(): Promise<boolean> {
		const url = `http://${this._host}:${this._port}/api/meeting`
		const response = await fetch(url, {
			method: 'post',
			headers: this._defaultHeaders,
			body: JSON.stringify({ kind: 'NewMeetingFromLocalTemplate' }),
		})
		this.checkStatus(response)
		return true
	}

	public async StopMeeting(): Promise<boolean> {
		const url = `http://${this._host}:${this._port}/api/meeting`
		const response = await fetch(url, {
			method: 'delete',
			headers: this._defaultHeaders,
		})
		this.checkStatus(response)
		return true
	}

	public async GetRecording(): Promise<string> {
		const url = `http://${this._host}:${this._port}/api/recording/state`
		const response = await fetch(url, {
			method: 'get',
			headers: this._defaultHeaders,
		})
		this.checkStatus(response)
		const data = (await response.json()) as TelevicRecordingResponse
		return data.state
	}

	public async SetRecording(recordingState: string): Promise<Response> {
		let recording = 'idle'
		if (recordingState == 'true') {
			recording = 'recording'
		}
		const url = `http://${this._host}:${this._port}/api/recording/state`
		const response = await fetch(url, {
			method: 'put',
			headers: this._defaultHeaders,
			body: JSON.stringify({ state: recording }),
		})
		return this.checkStatus(response)
	}

	public async RebootSystem(): Promise<Response> {
		const url = `http://${this._host}:${this._port}/api/system/reboot`
		const response = await fetch(url, {
			method: 'post',
			headers: this._defaultHeaders,
			body: '', // JSON.stringify({})
		})
		return this.checkStatus(response)
	}

	public async GetLoudspeakerVolume(): Promise<number> {
		const url = `http://${this._host}:${this._port}/api/audio/loudspeakervolume`
		const response = await fetch(url, {
			method: 'get',
			headers: this._defaultHeaders,
		})
		this.checkStatus(response)
		const data = (await response.json()) as TelevicVolumeResponse
		return data.gain
	}

	public async SetLoudspeakerVolume(volume: number): Promise<Response> {
		const url = `http://${this._host}:${this._port}/api/audio/loudspeakervolume`
		const response = await fetch(url, {
			method: 'put',
			headers: this._defaultHeaders,
			body: JSON.stringify({ gain: volume }),
		})
		return this.checkStatus(response)
	}

	public async GetDefaultChannelSelectorVolume(): Promise<number> {
		const url = `http://${this._host}:${this._port}/api/audio/defaultchannelselectorvolume`
		const response = await fetch(url, {
			method: 'get',
			headers: this._defaultHeaders,
		})
		this.checkStatus(response)
		const data = (await response.json()) as TelevicVolumeResponse
		return data.gain
	}

	public async SetDefaultChannelSelectorVolume(volume: number): Promise<Response> {
		const url = `http://${this._host}:${this._port}/api/audio/defaultchannelselectorvolume`
		const response = await fetch(url, {
			method: 'put',
			headers: this._defaultHeaders,
			body: JSON.stringify({ gain: volume }),
		})
		return this.checkStatus(response)
	}

	public async GetMicrophoneSensitivityOffset(seatNbr: number): Promise<number> {
		const url = `http://${this._host}:${this._port}/api/audio/seats/${seatNbr}/inputsensitivityoffset`
		const response = await fetch(url, {
			method: 'get',
			headers: this._defaultHeaders,
		})
		this.checkStatus(response)
		const data = (await response.json()) as TelevicSensitivityResponse
		return data.input_sensitivity_offset
	}

	public async SetMicrophoneSensitivityOffset(seatNbr: number, offset: number): Promise<Response> {
		const url = `http://${this._host}:${this._port}/api/audio/seats/${seatNbr}/inputsensitivityoffset`
		const response = await fetch(url, {
			method: 'put',
			headers: this._defaultHeaders,
			body: JSON.stringify({ input_sensitivity_offset: offset }),
		})
		return this.checkStatus(response)
	}
}
