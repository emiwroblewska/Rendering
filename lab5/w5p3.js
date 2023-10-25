"use strict";
window.onload = function () {
    main();
};
async function main() {
    var obj_filename = "../objects/teapot.obj";
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
            targets: [{ format: canvasFormat }],
        },
        primitive: {
            topology: "triangle-strip",
        },
    });

    readOBJFile(obj_filename, 1, true);

    const uniformBuffer = device.createBuffer({
        size: 40, // number of bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    let jitter = new Float32Array(200);
    const jitterBuffer = device.createBuffer({
        size: jitter.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });

    let texture = await load_texture(device, "./grass.jpg", true);
    const sampler00 = device.createSampler({
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
        minFilter: "nearest",
        magFilter: "nearest",
    });
    const sampler01 = device.createSampler({
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
        minFilter: "linear",
        magFilter: "linear",
    });
    const sampler10 = device.createSampler({
        addressModeU: "repeat",
        addressModeV: "repeat",
        minFilter: "nearest",
        magFilter: "nearest",
    });
    const sampler11 = device.createSampler({
        addressModeU: "repeat",
        addressModeV: "repeat",
        minFilter: "linear",
        magFilter: "linear",
    });

    const bindGroupBuffers = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
        {
            binding: 0,
            resource: { buffer: uniformBuffer },
        },
        {
            binding: 1,
            resource: { buffer: jitterBuffer },
        },
        ],
    });

    const bindGroup00 = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(1),
        entries: [
        { binding: 0, resource: sampler00 },
        { binding: 1, resource: texture.createView() },
        ],
    });
    const bindGroup01 = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(1),
        entries: [
        { binding: 0, resource: sampler01 },
        { binding: 1, resource: texture.createView() },
        ],
    });
    const bindGroup10 = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(1),
        entries: [
        { binding: 0, resource: sampler10 },
        { binding: 1, resource: texture.createView() },
        ],
    });
    const bindGroup11 = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(1),
        entries: [
        { binding: 0, resource: sampler11 },
        { binding: 1, resource: texture.createView() },
        ],
    });

    var glass = document.getElementById("glass").value;
    var matte = document.getElementById("matte").value;
    var light_x = document.getElementById("light_x").value;
    var light_y = document.getElementById("light_y").value;
    var light_z = document.getElementById("light_z").value;
    var address = document.getElementById("address").value;
    var filter = document.getElementById("filter").value;
    var use_texture = document.getElementById("textures").checked;
    var texture_scaling = document.getElementById("texture_scaling").value;
    var subdivs = document.getElementById("subdivs").value;
    const aspect = canvas.width / canvas.height;
    var cam_const = 2.5;
    var uniforms = new Float32Array([
        aspect,
        cam_const,
        glass,
        matte,
        light_x,
        light_y,
        light_z,
        use_texture,
        texture_scaling,
        subdivs,
    ]);

    var bindGroup = getBindGroup();

    function getBindGroup() {
        if (address === "repeat") {
        if (filter === "linear") {
            return bindGroup11;
        } else {
            return bindGroup10;
        }
        } else {
        if (filter === "linear") {
            return bindGroup01;
        } else {
            return bindGroup00;
        }
        }
    }

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

    function onReadComplete(device, pipeline) {
        // Get access to loaded data
        g_drawingInfo = g_objDoc.getDrawingInfo();
        // Set up buffers
        const positionsBuffer = device.createBuffer({
            size: g_drawingInfo.vertices.byteLength,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
        });
        device.queue.writeBuffer(positionsBuffer, 0, g_drawingInfo.vertices);
        const indicesBuffer = device.createBuffer({
            size: g_drawingInfo.indices.byteLength,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
        });
        device.queue.writeBuffer(indicesBuffer, 0, g_drawingInfo.indices);
        const normalsBuffer = device.createBuffer({
            size: g_drawingInfo.normals.byteLength,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
        });
        device.queue.writeBuffer(normalsBuffer, 0, g_drawingInfo.normals);
        // Create and return bind group
        const bindGroupObj = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(2),
        entries: [
            {
                binding: 0,
                resource: { buffer: positionsBuffer },
            },
            {
                binding: 1,
                resource: { buffer: indicesBuffer },
            },
            {
                binding: 2,
                resource: { buffer: normalsBuffer },
            },],
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
        uniforms[2] = Number(glass);
        uniforms[3] = Number(matte);
        uniforms[4] = Number(light_x);
        uniforms[5] = Number(light_y);
        uniforms[6] = Number(light_z);
        uniforms[7] = Number(use_texture);
        uniforms[8] = Number(texture_scaling);
        uniforms[9] = Number(subdivs);
        compute_jitters(jitter, 1 / canvas.height, subdivs);
        device.queue.writeBuffer(jitterBuffer, 0, jitter);
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        render(
            device,
            context,
            pipeline,
            bindGroupBuffers,
            bindGroup,
            bindGroupObj);
    }

    addEventListener("wheel", (event) => {
        cam_const *= 1.0 + 2.5e-4 * event.deltaY;
        requestAnimationFrame(animate);
    });

    addEventListener("change", () => {
        glass = document.getElementById("glass").value;
        matte = document.getElementById("matte").value;
        address = document.getElementById("address").value;
        filter = document.getElementById("filter").value;
        bindGroup = getBindGroup();
        use_texture = document.getElementById("textures").checked;
        requestAnimationFrame(animate);
    });

    addEventListener("input", () => {
        light_x = document.getElementById("light_x").value;
        light_y = document.getElementById("light_y").value;
        light_z = document.getElementById("light_z").value;
        subdivs = document.getElementById("subdivs").value;
        texture_scaling = document.getElementById("texture_scaling").value;
        requestAnimationFrame(animate);
    });

    animate();

    async function load_texture(device, filename) {
        const img = document.createElement("img");
        img.src = filename;
        await img.decode();
        const imageCanvas = document.createElement("canvas");
        imageCanvas.width = img.width;
        imageCanvas.height = img.height;

        const imageCanvasContext = imageCanvas.getContext("2d");
        imageCanvasContext.drawImage(img,0,0,imageCanvas.width,imageCanvas.height);
        const imageData = imageCanvasContext.getImageData(0,0,imageCanvas.width,imageCanvas.height);

        let textureData = new Uint8Array(img.width * img.height * 4);
        for (let i = 0; i < img.height; ++i) {
            for (let j = 0; j < img.width; ++j) {
                for (let k = 0; k < 4; ++k) {
                textureData[(i * img.width + j) * 4 + k] =
                    imageData.data[((img.height - i - 1) * img.width + j) * 4 + k];
                }
            }
        }
        const texture = device.createTexture({
            size: [img.width, img.height, 1],
            format: "rgba8unorm",
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
        });
        device.queue.writeTexture(
            { texture: texture },
            textureData,
            { offset: 0, bytesPerRow: img.width * 4, rowsPerImage: img.height },
            [img.width, img.height, 1]
        );
        return texture;
    }

    function compute_jitters(jitter, pixelsize, subdivs) {
        const step = pixelsize / subdivs;
        if (subdivs < 2) {
            jitter[0] = 0.0;
            jitter[1] = 0.0;
        } else {
            for (var i = 0; i < subdivs; ++i)
                for (var j = 0; j < subdivs; ++j) {
                    const idx = (i * subdivs + j) * 2;
                    jitter[idx] = (Math.random() + j) * step - pixelsize * 0.5;
                    jitter[idx + 1] = (Math.random() + i) * step - pixelsize * 0.5;
                }
        }
    }

    async function render(
        device,
        context,
        pipeline,
        bindGroupBuffers,
        bindGroup,
        bindGroupObj
    ) {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
                clearColor: { r: 0.1, g: 0.3, b: 0.6, a: 1.0 },
            },],
    });

        pass.setBindGroup(0, bindGroupBuffers);
        pass.setBindGroup(1, bindGroup);
        pass.setBindGroup(2, bindGroupObj);
        pass.setPipeline(pipeline);
        pass.draw(4);
        pass.end();

        device.queue.submit([encoder.finish()]);
    }
}