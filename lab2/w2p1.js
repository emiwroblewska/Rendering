"use strict";
window.onload = function () { main(); }
async function main() {
    const gpu = navigator.gpu;
    const adapter = await gpu.requestAdapter();
    const device = await adapter.requestDevice();
    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("gpupresent") || canvas.getContext("webgpu");
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
    });

    // Create a render pass in a command buffer and submit it
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
    colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store",
        }]
    });

    const wgsl = device.createShaderModule({
        code: document.getElementById("wgsl").text
    });

    const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: wgsl,
            entryPoint: "main_vs",
        },
        fragment: {
            module: wgsl,
            entryPoint: "main_fs",
            targets: [{ format: canvasFormat }]
        },
        primitive: {
            topology: "triangle-strip",
        },
    });

    const uniformBuffer = device.createBuffer({
        size: 16, // number of bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: { buffer: uniformBuffer }
        }],
    });

    const aspect = canvas.width / canvas.height;
    var cam_const = 1.0;
    var glass = document.getElementById("glass").value;
    var matte = document.getElementById("matte").value;
    var uniforms = new Float32Array([aspect, cam_const, glass, matte]);

    // Scroll event handler
    addEventListener("wheel", (event) => {
        cam_const *= 1.0 + 2.5e-4*event.deltaY;
        requestAnimationFrame(tick);
    });
    function tick()
    {
        uniforms[1] = cam_const;
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        render(device, context, pipeline, bindGroup);
    }
    tick();

    addEventListener("change", () => {
        glass = document.getElementById("glass").value;
        matte = document.getElementById("matte").value;
        requestAnimationFrame(change);
    });

    function change() {
        uniforms[2] = glass;
        uniforms[3] = matte;
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        render(device, context, pipeline, bindGroup);
    }
    change();
    
    async function render(device, context, pipeline, bindGroup) {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
            {
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
                clearColor: { r: 0.1, g: 0.3, b: 0.6, a: 1.0 }, // Adjust clear color as needed
            },
            ],
        });
        pass.setBindGroup(0, bindGroup);
        pass.setPipeline(pipeline);
        pass.draw(4);
        pass.end();
        device.queue.submit([encoder.finish()]);
    }
}