# Wind components

`WindController` (`model.ts`) exposes `configure(windConfig)`, `receive(validatedSnapshotEvent)`, `setVisible(boolean)`, `clear()`, `view()`, `subscribe(listener)` and `dispose()`. Feed events through the existing AviadiloClient validation/revision boundary. Call `clear()` when a viewport/revision changes, and `setVisible(false)` when the layer/card is hidden. No controller/provider network connection exists.

`new WindLayer(leafletMap, controller)` owns two canvases in pane `wind` (z300). `dispose()` removes canvases/listeners/animation/subscription; `attach(map)` supports reuse. `diagnostics()` exposes particle count, animation state and canvas byte bound. Controller disposal is separately owned by the card.

`windPanel(view, edit)` in `controls.ts` renders source/status/model-valid time, unknown model run, actual source resolution, numeric grid-centre speed and every wind setting. `windControls(config, edit)` in `src/editor/wind-panel.ts` is the reusable editor helper. `edit(path,value)` patches one saved setting; preserve other/unknown fields in the parent.

`sampleWind(grid,lat,lon)` is the shared bilinear U/V sampler. Boundary cells with zero-weight null neighbours remain valid; no missing contributing corner is bridged. Longitude is resolved to the represented grid's world copy, with interpolation across the seam only when width × longitude spacing proves a complete 360° period. Wrapped views use one coarse full-longitude source band over the requested latitude span. Arrows point downwind; barb shafts point FROM and encode knots rounded to nearest 5 (half=5, full=10, triangle=50), independent of numeric units. Mercator scales true east/north equally by latitude; animation uses an explicitly visual speed multiplier, not geographic parcel travel or additional forecast resolution.

Particles default off, stop for reduced motion/document hidden/movement/detachment, cap at 1500 and 30 fps; resume never accumulates hidden time. Marker work caps at 4096, canvas RGBA at 8 MiB, with two raster surfaces and no retained frame history. No preview self-starts or queries providers.
