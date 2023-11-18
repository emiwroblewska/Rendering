"use strict";
window.onload = function () {
    main();
};
async function main() {
    var obj_filename = "../objects/CornellBox.obj";
    var g_objDoc = null; // Info parsed from OBJ file
    var g_drawingInfo = null; // Info for drawing the 3D model with WebGL
    const gpu = navigator.gpu;
    const adapter = await gpu.requestAdapter();
    const device = await adapter.requestDevice();
    const canvas = document.getElementById("webgpu-canvas");
    const context =
        canvas.getContext("gpupresent") || canvas.getContext("webgpu");
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
    });
    const wgsl = device.createShaderModule({
        code: document.getElementById("wgsl").text,
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
            targets: [{ format: canvasFormat }, { format: "rgba32float" }],
        },
        primitive: {
            topology: "triangle-strip",
        },
    });

    var frame_count = 0;
    var isJittering = false;
    readOBJFile(obj_filename, 1, true);

    const uniformBuffer = device.createBuffer({
        size: 52, // number of bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    let textures = new Object();
    textures.width = canvas.width;
    textures.height = canvas.height;
    textures.renderSrc = device.createTexture({
        size: [canvas.width, canvas.height],
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        format: "rgba32float",
    });
    textures.renderDst = device.createTexture({
        size: [canvas.width, canvas.height],
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        format: "rgba32float",
    });

    const bindGroupBuffers = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
        {
        binding: 0,
        resource: { buffer: uniformBuffer },
        },],
    });

    const bindGroupTexture = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(1),
    entries: [{ binding: 0, resource: textures.renderDst.createView() }],
    });

    var subdivs = document.getElementById("subdivs").value;
    const aspect = canvas.width / canvas.height;
    var cam_const = 1.0;
    var uniforms = new Float32Array([
        aspect,
        cam_const,
        subdivs,
        canvas.width,
        canvas.height,
        frame_count,
    ]);

    var bindGroupObj;

    function readOBJFile(fileName, scale, reverse) {
        var request = new XMLHttpRequest();
        request.onreadystatechange = function () {
        if (request.readyState === 4 && request.status !== 404)
            onReadOBJFile(request.responseText, fileName, scale, reverse);
        };
        request.open("GET", fileName, true); // Create a request to get file
        request.send(); // Send the request
    }

    function onReadOBJFile(fileString, fileName, scale, reverse) {
        var objDoc = new OBJDoc(fileName); // Create a OBJDoc object
        var result = objDoc.parse(fileString, scale, reverse);
        if (!result) {
            g_objDoc = null;
            g_drawingInfo = null;
            console.log("OBJ file parsing error.");
            return;
        }
        g_objDoc = objDoc;
    }
    let buffers = {}

    function onReadComplete(device, pipeline) {
        // Get access to loaded data
        g_drawingInfo = g_objDoc.getDrawingInfo();
        console.log(g_drawingInfo);
        buffers = build_bsp_tree(g_drawingInfo, device, buffers);
    
        const lIndicesBuffer = device.createBuffer({
            size: g_drawingInfo.light_indices.byteLength,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
        });
        device.queue.writeBuffer(lIndicesBuffer, 0, g_drawingInfo.light_indices);
    
        //flatten data
        const colors = [];
        for (const material of g_drawingInfo.materials) {
            colors.push(
                material.color.r,
                material.color.g,
                material.color.b,
                material.color.a
            );
            colors.push(
                material.emission.r,
                material.emission.g,
                material.emission.b,
                material.emission.a
            );
        }
        const colorsBuffer = device.createBuffer({
            size: Float32Array.BYTES_PER_ELEMENT * colors.length,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
        });
        device.queue.writeBuffer(colorsBuffer, 0, new Float32Array(colors));
        
        const bindGroupObj = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(2),
            entries: [
                {
                    binding: 0,
                    resource: { buffer: buffers.attribs },
                },
                {
                    binding: 1,
                    resource: { buffer: colorsBuffer },
                },
                {
                    binding: 2,
                    resource: { buffer: buffers.indices },
                },
                {
                    binding: 3,
                    resource: { buffer: buffers.treeIds },
                },
                {
                    binding: 4,
                    resource: { buffer: buffers.bspTree },
                },
                {
                    binding: 5,
                    resource: { buffer: buffers.bspPlanes },
                },
                {
                    binding: 6,
                    resource: { buffer: buffers.aabb },
                },
                {
                    binding: 7,
                    resource: { buffer: lIndicesBuffer },
                },
            ],
        });
        return bindGroupObj;
    }

    function animate() {
        if (!g_drawingInfo && g_objDoc && g_objDoc.isMTLComplete()) {
            // OBJ and all MTLs are available
            bindGroupObj = onReadComplete(device, pipeline);
        }
        if (!g_drawingInfo) {
            requestAnimationFrame(animate);
            return;
        }
        uniforms[1] = cam_const;
        uniforms[2] = Number(subdivs);
        uniforms[3] = Number(canvas.width);
        uniforms[4] = Number(canvas.height);
        uniforms[5] = Number(frame_count);
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        render(
            device,
            context,
            pipeline,
            bindGroupBuffers,
            bindGroupTexture,
            bindGroupObj
        );

        if (isJittering) {
            requestAnimationFrame(animate);
        }
    }

    addEventListener("wheel", (event) => {
        cam_const *= 1.0 + 2.5e-4 * event.deltaY;
        requestAnimationFrame(animate);
    });

    var button = document.getElementById("jitter");
    button?.addEventListener("click", function () {
        isJittering = !isJittering;
        document.getElementById("jitter").innerHTML = isJittering ? "Stop" : "Start";
        requestAnimationFrame(animate);
    });

    addEventListener("input", () => {
        subdivs = document.getElementById("subdivs").value;
        requestAnimationFrame(animate);
    });

    animate();

    async function render(
        device,
        context,
        pipeline,
        bindGroupBuffers,
        bindGroupTextures,
        bindGroupObj
    ) {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
            {
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
            },
            {
                view: textures.renderSrc.createView(),
                loadOp: "load",
                storeOp: "store",
            },
        ],
    });

        pass.setBindGroup(0, bindGroupBuffers);
        pass.setBindGroup(1, bindGroupTextures);
        pass.setBindGroup(2, bindGroupObj);
        pass.setPipeline(pipeline);
        pass.draw(4);
        pass.end();

        encoder.copyTextureToTexture(
            { texture: textures.renderSrc },
            { texture: textures.renderDst },
            [textures.width, textures.height]
        );
        frame_count += 1;

        device.queue.submit([encoder.finish()]);
    }
}