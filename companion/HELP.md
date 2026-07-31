## Televic Confero, Plixus and D-Cerno AE

Controls a Televic conference system through the Customer REST API: **Confero**, **Plixus MME / AE-R / WAP**
and the **D-Cerno AE**.

> This is **not** the module for a D-Cerno CU or CUR. Those speak TCCP on raw TCP port 5011 and need the
> `televic-dcerno` module. Pointing this module at a CU/CUR gives a refused connection.

Not every platform exposes every endpoint. Anything missing degrades on its own: the feature goes quiet, the
connection stays healthy. The differences seen so far are listed under *Platform differences* below.

### Setup

1. On the web GUI, go to **Technician › Settings › API settings** and click **Generate API Token**.
2. In the module configuration, fill in:
   - **IP** — the address of the central unit
   - **Port** — `9080` over HTTP, `9443` over HTTPS
   - **API bearer token** — the token generated above
3. If the unit is configured for HTTPS, tick **Use HTTPS** and change the port. Self-signed certificates need
   the corresponding checkbox.

The module tests the connection at startup: a wrong token shows as a configuration error, an unreachable unit
as a connection failure. It does not report "Ok" until the unit has actually answered.

### Seat numbers

Seats are rarely numbered 1, 2, 3 — a room can be wired 20, 25, 30. The module reads the seat numbers from
the unit and builds its variables and presets from those. The **Seats before discovery** field is only a
fallback used until the AE has answered.

Actions and feedbacks take a free seat number, so a seat that exists but is not in the preset list can always
be driven by typing its number.

### Polling and real-time events

By default the module polls. One request per tick covers the whole room, so a 1000 ms interval is cheap even
on a full system. Slow-moving values (recording, volumes, discussion settings, seat presence) refresh every
fifth tick.

**Real-time events (long polling)** subscribes to `/api/notification/events` so changes show up immediately
instead of on the next tick. If the firmware does not expose it, the module logs a warning and goes back to
polling on its own.

### Volumes

The API expresses gain in units of **0.1 dB** — a raw value of `-140` means **−14.0 dB**. Actions and
variables in this module work in dB and convert on the way in and out. The usable range depends on the unit,
so the fields allow a wide span rather than a guessed limit; the AE rejects out-of-range values with an HTTP
error that appears in the log.

### Actions

- **Microphone** and **request to speak** — on, off or toggle per seat. Toggling resolves against the last
  known state, and only the field being changed is sent, so switching a microphone never clears a pending
  request to speak.
- **Floor control** — give the floor to the next seat in the request list, close the microphone that has been
  open the longest, or hand the floor to a single seat (solo: every other open microphone is closed first).
- **Lists** — clear all speakers, clear delegate speakers only (chairpersons keep the floor), clear requests.
- **Discussion** — microphone mode (direct speak, request, group, operator, hands free) and maximum number of
  open microphones.
- **Meeting** — start from the local template, or stop. Confero and Plixus only.
- **Recording** — set to recording, paused or idle, or toggle.
- **Audio** — loudspeaker and default channel selector volume, absolute or relative, per-seat input
  sensitivity offset, activation of an audio configuration, and a push of the default volume onto every
  channel selector.
- **System** — seat reordering mode, and reboot behind a confirmation checkbox.

### Feedbacks

Microphone open, requesting to speak, at least one microphone open, seat is next in line, seat role
(chairperson / VIP / delegate), seat online, recording state, current microphone mode, active audio
configuration, seat reordering active, and **fewer units online than expected** — set that last one to the
number of desks you rigged and the button lights up the moment one drops off. All of them read the cache
filled by the poll loop, so redrawing a page of buttons costs no network traffic.

### Variables

Per seat: `seat_N_mic`, `seat_N_request`, `seat_N_role`, `seat_N_online`.

Room-wide: `active_mic_count`, `active_seats`, `first_speaker`, `last_speaker`, `requesting_count`,
`requesting_seats`, `next_request`, `chairperson_seats`, `recording_state`, `loudspeaker_volume`,
`channelselector_volume`, `mic_mode`, `max_speakers`, `room_seat_count`, `seats_online`, `units_online`,
`units_total`, `units_offline`, `audio_config`, `audio_config_count`, `reordering_state`.

Ranked slots: `speaker_1` … `speaker_8` and `request_1` … `request_8`, so a button can show who holds the
floor without writing an expression.

`active_seats` and `requesting_seats` are ordered oldest first, as reported by the unit. The unit counts
itself in its device list, so `units_online` and `units_total` exclude the central unit and report desks
only.

### Platform differences

Verified against a D-Cerno AE on firmware 1.x:

| Endpoint                                        | D-Cerno AE | Effect when missing                          |
| ----------------------------------------------- | ---------- | -------------------------------------------- |
| `/api/meeting`                                   | 404        | Meeting actions log a line, no error status  |
| `/api/discussion/seats` (whole room in one call) | yes        | Falls back to batched per-seat reads         |
| `/api/audio/configurations`                      | yes        | Configuration dropdown and preset disappear  |
| `/api/device/devices`                            | yes        | `units_*` variables stay empty               |
| `/api/notification/events`                       | yes        | Falls back to periodic polling               |

Every one of those reads is issued independently, so a platform lacking one keeps everything else.

### Two traps in the REST API

Both cost a **400 Bad Request** and are handled by the module, but they are worth knowing if you script the
unit yourself:

- A seat PUT must carry **both** `microphoneOn` and `requestingToSpeak`. Sending only the one you want to
  change answers `Missing json field`. The module fills the other one from its cache, so switching a
  microphone still never clears a pending request to speak.
- The discussion `options` object must match the mode you are **switching to**, not the one you are leaving.
  Each mode has its own required fields, so sending operator's `{ledColorOn, ledColorOff}` along with
  `microphoneMode: "directSpeak"` is rejected. The module rebuilds the options for the target mode and keeps
  the LED colours already configured on the unit.

### Known limits

- `paused` is offered as a recording state, but not every firmware implements it.
- The "push the default volume to every channel selector" action overwrites the headphone level each
  delegate has set. It is the only action that has not been fired against real hardware, precisely because
  it cannot be undone.
- Everything here was verified on a D-Cerno AE. On Confero and Plixus the module keeps the behaviour of the
  previous release for the endpoints they already used; the additions were not exercised on that hardware.
