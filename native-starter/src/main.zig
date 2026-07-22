// Minimal PiPilot native-UI starter (Model-View-Update, markup view).
// Derived from the verbatim Native SDK `habits` example. `native dev` opens the
// window and hot-reloads src/counter.native without losing model state.
const std = @import("std");
const builtin = @import("builtin");
const runner = @import("runner");
const native_sdk = @import("native_sdk");

pub const panic = std.debug.FullPanic(native_sdk.debug.capturePanic);

const canvas = native_sdk.canvas;
const geometry = native_sdk.geometry;

const canvas_label = "counter-canvas";
const window_width: f32 = 360;
const window_height: f32 = 240;

const app_permissions = [_][]const u8{ native_sdk.security.permission_command, native_sdk.security.permission_view };
const shell_views = [_]native_sdk.ShellView{
    .{ .label = canvas_label, .kind = .gpu_surface, .fill = true, .role = "Counter canvas", .accessibility_label = "Counter", .gpu_backend = .metal, .gpu_pixel_format = .bgra8_unorm, .gpu_present_mode = .timer, .gpu_alpha_mode = .@"opaque", .gpu_color_space = .srgb, .gpu_vsync = true },
};
const shell_windows = [_]native_sdk.ShellWindow{.{
    .label = "main",
    .title = "Counter",
    .width = window_width,
    .height = window_height,
    .restore_state = false,
    .views = &shell_views,
}};
pub const shell_scene: native_sdk.ShellConfig = .{ .windows = &shell_windows };

// ----- model / msg / update -----

pub const Model = struct {
    count: i32 = 0,

    /// Arena-taking scalar binding: {countLabel} re-formats each rebuild.
    /// Derived display values are model methods, never stored fields.
    pub fn countLabel(model: *const Model, arena: std.mem.Allocator) []const u8 {
        return std.fmt.allocPrint(arena, "Count: {d}", .{model.count}) catch "";
    }
};

pub const Msg = union(enum) {
    inc,
    dec,
    reset,
};

/// The only place state mutates.
pub fn update(model: *Model, msg: Msg) void {
    switch (msg) {
        .inc => model.count += 1,
        .dec => model.count -= 1,
        .reset => model.count = 0,
    }
}

// ----- view (markup) -----

pub const counter_markup = @embedFile("counter.native");
pub const CompiledCounterView = canvas.CompiledMarkupView(Model, Msg, counter_markup);

const dev_markup_reload = builtin.mode == .Debug;
const CounterApp = native_sdk.UiAppWithFeatures(Model, Msg, .{ .runtime_markup = dev_markup_reload });

pub fn main(init: std.process.Init) !void {
    const app_state = try std.heap.page_allocator.create(CounterApp);
    defer std.heap.page_allocator.destroy(app_state);
    app_state.* = CounterApp.init(std.heap.page_allocator, .{}, .{
        .name = "counter",
        .scene = shell_scene,
        .canvas_label = canvas_label,
        .update = update,
        .view = CompiledCounterView.build,
        .markup = if (dev_markup_reload)
            .{ .source = counter_markup, .watch_path = "src/counter.native", .io = init.io }
        else
            null,
    });
    defer app_state.deinit();
    try runner.runWithOptions(app_state.app(), .{
        .app_name = "counter",
        .window_title = "Counter",
        .bundle_id = "dev.pipilot.app.counter",
        .default_frame = geometry.RectF.init(0, 0, window_width, window_height),
        .restore_state = false,
        .js_window_api = false,
        .security = .{
            .permissions = &app_permissions,
            .navigation = .{ .allowed_origins = &.{ "zero://inline", "zero://app" } },
        },
    }, init);
}
