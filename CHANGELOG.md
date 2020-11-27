# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added

### Fixed


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