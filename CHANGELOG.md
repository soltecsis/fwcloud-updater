# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.3] - 2026-01-22
### Fixed
- Updated Node.js packages to the latest versions.


## [2.0.2] - 2025-09-09
### Fixed
- Upgraded npm packages to the latest versions.


## [2.0.1] - 2024-10-29
### Changed
- Default `LISTEN_HOST` config option value from `localhost` to `127.0.0.1` in order to avoid that with the default configuration the process starts listening only in IPv6 if `localhost` resolves in the `/etc/hosts` file to the IPv6 IP.

### Fixed
- Updated Node.js packages to the latest versions.


## [2.0.0] - 2024-10-19
### Added
- Added fresh_build_start npm run script.
- Added eslint and Prettier checks to CI.

### Fixed
- Updated packages to the last versions.
- Updated npm modules.
- Updated CI with last node versions.
- Delete unused packages.
- Update eslint config file.


## [1.1.0] - 2023-03-09
### Added
- Task in package.json file for TLS certificates update.
- Script for TLS certificate update.

### Fixed
- Update NestJS to version 8.
- Updated npm modules.

### Changed
- If PID file exists, stop before start.


## [1.0.7] - 2020-12-07
### Added
- Logger for store http requests into logs/http.log.
- Middleware for log http requests.
- Store pid in .pid file.
- Npm script for stop process using the pid stored in .pid file.
- SGTERM and SIGINT signal handlers.
- Implement API call for FWCloud Websrv updates (PUT /updates/websrv).
- HTTPS support.
- Unit tests.
- Workflow for Github actions.

## Changed
- Improved compare versions error handling.


## [1.0.6] - 2020-11-25
### Added
- License information.
- Node module child-process-promise.
- Config option for server listen host (default value localhost).
- PUT /updates/api returns immidiatelly and makes update task in background.

### Fixed
- Avoid execution lock while running update command.
- Use child-process-promise module instead of node-cmd.


## [1.0.0] - 2020-11-24
### Added
- Updates controller and service for manage updates requests.
- GET /updates : Returns current and last versions of api, ui and updater.
- PUT /updates/ui : Runs update procedure for fwcloud-ui.
- PUT /updates/api : Runs update procedure for fwcloud-api.
- Autentication middleware. 