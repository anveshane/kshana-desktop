# Vendored Editor Modules

This folder contains copied source chunks from OpenCut and OpenReel for the
Rich Editor Beta integration.

- OpenCut sources are copied under `opencut/`
- OpenReel sources are copied under `openreel/`
- Compatibility shims are in `shims/` and `ui/`

Current integration mode keeps these modules compile-isolated and accessed
through Kshana adapters so `.kshana/ui/timeline.json` (schema v2) remains the
single write authority.
