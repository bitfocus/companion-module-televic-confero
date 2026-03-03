## Televic Confero

This module controls [Televic Confero](https://www.televic.com/en/conference/products/meeting-management-software/confero) and related hardware.

### Supported Devices

- Plixus MME
- Plixus AE-R
- Plixus WAP
- D-Cerno AE

### Getting Started

- In the module configuration, enter the IP address and port of your Confero platform
- You will need to create an API Bearer token. On the Confero platform, go to API Settings & Type tab, and click on the Generate API Token button. You can copy and paste this token into the module configuration.
- If you installation is using HTTPS, you should enable it. Keep in mind, if you are using HTTPS you will need to change the port number to match (the HTTPS default is 9443).
- If you are using a self-signed certificate (not recommended), you can also choose to allow those in the config.
