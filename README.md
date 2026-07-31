# companion-module-televic-confero

Bitfocus Companion module for Televic conference systems driven through the Customer REST API: Confero,
Plixus MME / AE-R / WAP, and the D-Cerno AE.

Not to be confused with `televic-dcerno`, which targets the older D-Cerno CU/CUR over TCCP on TCP 5011.

## Development

```bash
yarn install
yarn build
yarn test
```

`yarn test` runs the REST client against a local mock reproducing the payloads a real unit returns: seat
states carrying `seatNumber` and `role`, gains in 0.1 dB units, 204 responses, the per-mode discussion
options, the device list including the central unit, and the error paths (401, 404, timeout, refused
connection).

See `companion/HELP.md` for the user-facing documentation, including the platform differences and the two
API behaviours that cost a 400 Bad Request.
