import { app } from "../../scripts/app.js";

function extractMetaDataFromBuffer(buffer) {
    const view = new DataView(buffer);
    if (view.getUint32(0) !== 0x89504E47) {
        console.warn("Not a PNG file");
        return { workflow: null, prompt: null };
    }
    const findChunk = (keyword) => {
        let offset = 8;
        while (offset < view.byteLength) {
            const length = view.getUint32(offset);
            const type = String.fromCharCode(
                view.getUint8(offset + 4),
                view.getUint8(offset + 5),
                view.getUint8(offset + 6),
                view.getUint8(offset + 7)
            );
            if (type === "tEXt") {
                const dataStart = offset + 8;
                const dataView = new Uint8Array(buffer.slice(dataStart, dataStart + length));
                const text = new TextDecoder().decode(dataView);
                const nullIndex = text.indexOf("\0");
                if (nullIndex > 0) {
                    const key = text.substring(0, nullIndex);
                    const value = text.substring(nullIndex + 1);
                    if (key === keyword) {
                        try {
                            return JSON.parse(value);
                        } catch {
                            return value;
                        }
                    }
                }
            }
            offset += 12 + length;
        }
        return null;
    };

    return {
        workflow: findChunk("workflow"),
        prompt: findChunk("prompt")
    };
}

function isFeatureEnabled() {
    return app.ui.settings.getSettingValue("DnDMetadata.General.enable");
}

app.registerExtension({
    name: "dragAndDrop_metaData",
    // onDrag patch //
    async beforeRegisterNodeDef(nodeType) {
        const origOnDragDrop = nodeType.prototype.onDragDrop;
        const origOnDragOver = nodeType.prototype.onDragOver;
        nodeType.prototype.onDragOver = function (e) {
            const handled = origOnDragOver?.apply(this, arguments);
            if (handled != null) {
                return handled;
            }
            return isFeatureEnabled();
        };
        nodeType.prototype.onDragDrop = async function (e) {
            const handled = await origOnDragDrop?.apply(this, arguments);
            const files = e.dataTransfer?.files;
            if (!files?.length) return handled;
            const buffer = await files[0].arrayBuffer();
            const { workflow, prompt } = extractMetaDataFromBuffer(buffer);
            if (workflow) {
                const mine = await importMetaData(this, workflow, prompt, e);
                return handled || mine;
            }
            return handled;
        };
    },

    async setup() {
        // CSS //
        const cssUrl = new URL("./nodeMenu.css", import.meta.url).href;
        if (!document.querySelector(`link[href="${cssUrl}"]`)) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.type = "text/css";
            link.href = cssUrl;
            document.head.appendChild(link);
        }
        // settings //
        const SETTINGS = [
            {
                id: "DnDMetadata.General.Accuracy",
                name: "🎯 Accuracy",
                defaultValue: 0,
                type: "slider",
                attrs: { min: 0, max: 5, step: 1 },
                tooltip: "Filters out roles with a score lower than given number"
            },
            // Model //
            {
                id: "DnDMetadata.1-Model.WidgetHints",
                name: "Widget Hints",
                defaultValue: 2,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            {
                id: "DnDMetadata.1-Model.DownstreamHints",
                name: "Downstream Hints",
                defaultValue: 1,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            {
                id: "DnDMetadata.1-Model.NodeHints",
                name: "Node Hints",
                defaultValue: 1,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            // Lora //
            {
                id: "DnDMetadata.2-Lora.WidgetHints",
                name: "Widget Hints",
                defaultValue: 1,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            {
                id: "DnDMetadata.2-Lora.DownstreamHints",
                name: "Downstream Hints",
                defaultValue: 1,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            {
                id: "DnDMetadata.2-Lora.NodeHints",
                name: "Node Hints",
                defaultValue: 2,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            // Prompt //
            {
                id: "DnDMetadata.3-Prompt.WidgetHints",
                name: "Widget Hints",
                defaultValue: 1,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            {
                id: "DnDMetadata.3-Prompt.NodeHints",
                name: "Node Hints",
                defaultValue: 1,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            // Positive //
            {
                id: "DnDMetadata.4-Positive.WidgetHints",
                name: "Widget Hints",
                defaultValue: 1,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            {
                id: "DnDMetadata.4-Positive.DownstreamHints",
                name: "Downstream Hints",
                defaultValue: 1,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            {
                id: "DnDMetadata.4-Positive.NodeHints",
                name: "Node Hints",
                defaultValue: 3,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            // Negative //
            {
                id: "DnDMetadata.5-Negative.WidgetHints",
                name: "Widget Hints",
                defaultValue: 1,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            {
                id: "DnDMetadata.5-Negative.DownstreamHints",
                name: "Downstream Hints",
                defaultValue: 1,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            {
                id: "DnDMetadata.5-Negative.NodeHints",
                name: "Node Hints",
                defaultValue: 3,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            // SamplerParams //
            {
                id: "DnDMetadata.6-SamplerParams.WidgetHints",
                name: "Widget Hints",
                defaultValue: 1,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            {
                id: "DnDMetadata.6-SamplerParams.DownstreamHints",
                name: "Downstream Hints",
                defaultValue: 1,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            {
                id: "DnDMetadata.6-SamplerParams.NodeHints",
                name: "Node Hints",
                defaultValue: 1,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            // Latent //
            {
                id: "DnDMetadata.7-Latent.WidgetHints",
                name: "Widget Hints",
                defaultValue: 1,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            {
                id: "DnDMetadata.7-Latent.DownstreamHints",
                name: "Downstream Hints",
                defaultValue: 1,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
            {
                id: "DnDMetadata.7-Latent.NodeHints",
                name: "Node Hints",
                defaultValue: 1,
                type: "slider",
                attrs: { min: 1, max: 5, step: 1 },
            },
        ];
        app.ui.settings.addSetting({
            id: "DnDMetadata.ResetButton",
            name: "Reset All Settings",
            type: "text",
        });
        app.ui.settings.addSetting({
            id: "DnDMetadata.General.enable",
            name: "Enable Drag & Drop Metadata Import",
            defaultValue: true,
            type: "boolean",
            tooltip: "When enabled, dragging PNG with embedded workflow onto non-media nodes will import widget values."
        });
        SETTINGS.forEach(setting => {
            app.ui.settings.addSetting(setting);
        });
        function injectResetButton() {
            const row = document.querySelector(
                '[data-setting-id="DnDMetadata.ResetButton"]'
            );
            if (!row || row.dataset.injected) {
                return;
            }
            row.dataset.injected = "true";
            const inputContainer = row.querySelector(".form-input");
            if (!inputContainer) {
                return;
            }
            inputContainer.innerHTML = "";
            const button = document.createElement("button");
            button.textContent = "Reset Settings";
            button.style.padding = "6px 12px";
            button.style.cursor = "pointer";
            button.style.borderRadius = "8px";
            button.style.border = "none";
            button.style.background = "#3b82f6";
            button.style.color = "white";
            button.style.fontWeight = "600";
            button.style.transition = "all 0.15s ease";
            button.onmouseenter = () => {
                button.style.filter = "brightness(1.1)";
            };
            button.onmouseleave = () => {
                button.style.filter = "brightness(1)";
            };
            button.onclick = async () => {
                for (const setting of SETTINGS) {
                    await app.ui.settings.setSettingValue(
                        setting.id,
                        setting.defaultValue
                    );
                }
            };
            inputContainer.appendChild(button);
        };
        function injectIndividualResetButtons() {
            for (const setting of SETTINGS) {
                const row = document.querySelector(
                    `[data-setting-id="${setting.id}"]`
                );
                if (!row || row.dataset.resetInjected) {
                    continue;
                }
                row.dataset.resetInjected = "true";
                const inputContainer = row.querySelector(".form-input");
                if (!inputContainer) {
                    continue;
                }
                const resetBtn = document.createElement("button");
                resetBtn.innerHTML = "↺";
                resetBtn.title = "Reset to default";
                resetBtn.style.marginLeft = "8px";
                resetBtn.style.width = "22px";
                resetBtn.style.height = "22px";
                resetBtn.style.borderRadius = "999px";
                resetBtn.style.border = "none";
                resetBtn.style.cursor = "pointer";
                resetBtn.style.fontSize = "12px";
                resetBtn.style.flexShrink = "0";
                resetBtn.style.transition = "all 0.15s ease";
                resetBtn.onclick = async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await app.ui.settings.setSettingValue(
                        setting.id,
                        setting.defaultValue
                    );
                };
                inputContainer.appendChild(resetBtn);
            }
        };
        const observer = new MutationObserver(() => {
            injectResetButton();
            injectIndividualResetButtons();

        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
        // patch helpers //
        const findUpstreamProto = (obj) => {
            if (!obj) return null;
            if (obj.constructor?.name === "RgthreeBaseNode") {
                return obj;
            }
            return findUpstreamProto(
                Object.getPrototypeOf(obj)
            );
        };
        const patchProto = (proto) => {
            if (!proto) return;
            const origDrop = proto.onDragDrop;
            const origOver = proto.onDragOver;
            proto.onDragOver = function (e) {
                const handled = origOver?.apply(this, arguments);
                if (handled === true) {
                    return true;
                }
                return isFeatureEnabled();
            };
            proto.onDragDrop = async function (e) {
                const handled = await origDrop?.apply(this, arguments);
                if (handled === true) {
                    return true;
                }
                const files = e.dataTransfer?.files;
                if (!files?.length) return handled;
                const buffer = await files[0].arrayBuffer();
                const { workflow, prompt } = extractMetaDataFromBuffer(buffer);
                if (workflow) {
                    return importMetaData(this, workflow, prompt, e);
                }
                return false;
            };
        };
        // rgthree patch //
        const rgthreeType = LiteGraph.registered_node_types["Seed (rgthree)"];
        if (rgthreeType) patchProto(findUpstreamProto(rgthreeType.prototype));
        // subgraph patch //
        const intervall = setInterval(() => {
            const subgraph = app.graph._nodes.find(n => n.subgraph);
            if (!subgraph) return;
            clearInterval(intervall);
            const subgraphProto = Object.getPrototypeOf(Object.getPrototypeOf(subgraph));
            subgraphProto ? patchProto(subgraphProto) : null;
        }, 500);
    },
});

function toNodeLabel(node) {
    return `${node.title || node.type || "Node"}${node.id != null ? ` #${node.id}` : ""}`;
}

function buildGraphCtx(workflow, prompt) {
    const promptData = new Map(
        Object.entries(prompt ?? {}).map(([k, v]) => [
            isNaN(k) ? k : Number(k),
            v
        ])
    );
    const nodes = workflow?.nodes ?? [];
    const nodesById = new Map(workflow.nodes.map(n => [n.id, n]));
    const normalizedLinks = workflow.links.map(l => Array.isArray(l) ?
        { id: l[0], origin_id: l[1], origin_slot: l[2], target_id: l[3], target_slot: l[4], type: l[5] } :
        { ...l });
    const linksById = new Map(normalizedLinks.map(l => [l.id, l]));
    const subs = workflow.definitions?.subgraphs || [];
    const subsById = new Map(subs?.map(s => [s.id, s]));
    const subsNodes = subs?.flatMap(n => n.nodes);
    const subsLinks = subs?.flatMap(l => l.links);
    const subsNodesById = new Map(subsNodes.map(n => [n.id, n]));
    const subsLinksById = new Map(subsLinks.map(l => [l.id, l]));
    const subsProxyNodes = workflow.nodes.filter(n => subsById.has(n.type));
    const subsProxyNodesById = new Map(subsProxyNodes.map(n => [n.id, n]));
    const subsProxyNodesByType = new Map(subsProxyNodes.map(n => [n.type, n]));
    const subgraphByNodeId = new Map();
    for (const node of nodes) {
        const sub = subs?.find(sg => sg.id === node.type);
        if (sub) {
            subgraphByNodeId.set(node.id, { node, sub });
        }
    }
    const allNodes = [];
    const idMap = new Map();
    for (const node of nodes) {
        if (subgraphByNodeId.has(node.id)) continue;
        allNodes.push({ ...node });
    }
    for (const [, key] of subgraphByNodeId.entries()) {
        const prefix = `${key.node.id}:`;
        if (key.sub.nodes) {
            for (const innerNode of key.sub.nodes) {
                const newId = prefix + innerNode.id;
                allNodes.push({ ...innerNode, id: newId });
                idMap.set(String(innerNode.id), newId);
            }
        }
    }
    const allNodesById = new Map(allNodes.map(n => [n.id, n]));
    const allActiveNodes = allNodes.filter(n => n.mode === 0);
    return {
        promptData,
        nodes,
        nodesById,
        linksById,
        subsById,
        subsProxyNodes,
        subsProxyNodesById,
        subsProxyNodesByType,
        subsNodes,
        subsNodesById,
        subsLinksById,
        allNodesById,
        allActiveNodes
    }
}

function findWidgetValue(linkedValue, graphCtx) {
    const inputs =
        graphCtx.promptData.get(linkedValue[0])?.inputs ??
        graphCtx.promptData.get(Number(linkedValue[0]))?.inputs;
    if (!inputs) return null;
    const value = Object.entries(inputs)[linkedValue[1]]?.[1];
    return Array.isArray(value)
        ? findWidgetValue(value, graphCtx)
        : value;
}

function enterSub(link, graphCtx) {
    const subNode = graphCtx.subsProxyNodesById.get(link.target_id);
    const sub = graphCtx.subsById.get(subNode.type);
    const subNodeInputName = subNode.inputs[link.target_slot].name;
    const entryLinks = sub.inputs.find(i => i.name === subNodeInputName).linkIds;
    return entryLinks || [];
}

function exitSub(link, graphCtx) {
    const sub = [...graphCtx.subsById.values()].find(s => s.links.includes(link));
    const subNode = graphCtx.subsProxyNodesByType.get(sub.id);
    const subOutputsMap = new Map(sub.outputs.map(o => [o.linkIds[0], o]));
    const subOutputName = subOutputsMap.get(link.id).name;
    const subNodeOutputsByName = new Map(subNode.outputs.map(o => [o.name, o]));
    const exitLinks = subNodeOutputsByName.get(subOutputName).links;
    return exitLinks || [];
}

function getDownstreamSignals(startNode, graphCtx) {
    const queue = [startNode];
    const visited = new Set([startNode.id]);
    const allowedLinkTypes = [
        "CONDITIONING",
        "STRING",
        "MODEL",
        "LATENT",
        "INT",
        "FLOAT",
        "SIGMAS",
        "SAMPLER",
        "NOISE",
    ];
    const initialLinkTypes = startNode.outputs.flatMap(o => o.links && allowedLinkTypes.some(t => t === o.type) ? o.type : []);
    const allowedPaths = initialLinkTypes.includes("STRING")
        ? [...initialLinkTypes, "CONDITIONING"]
        : initialLinkTypes;
    const signals = {
        reachesSampler: false,
        reachesModel: false,
        reachesPositive: false,
        reachesNegative: false,
        reachesInt: false,
        reachesFloat: false,
        reachesLatent: false,
    };
    if (!allowedPaths.length) return signals;
    while (queue.length > 0) {
        const currentNode = queue.shift();
        for (const output of currentNode.outputs) {
            if (!output.links || !allowedPaths.includes(output.type)) continue;
            const linksQueue = [...output.links];
            for (const linkId of linksQueue) {
                const link = graphCtx.linksById.get(linkId) ?? graphCtx.subsLinksById.get(linkId);
                if (!link) continue;
                if (link.target_id === -20) {
                    linksQueue.push(...exitSub(link, graphCtx));
                    continue;
                }
                const targetNode = graphCtx.nodesById.get(link.target_id) ?? graphCtx.subsNodesById.get(link.target_id);
                if (!targetNode) continue;
                if (graphCtx.subsProxyNodesById.has(targetNode.id)) {
                    linksQueue.push(...enterSub(link, graphCtx));
                    continue;
                }
                const targetInput = targetNode.inputs[link.target_slot];
                if (!targetInput) continue;
                const inputName = (targetInput.name || "").toLowerCase();
                const targetType = (targetNode.type || "").toLowerCase();
                const currentLinkType = link.type;
                if (targetNode.mode !== 4 && targetType.includes("sampler")) {
                    signals.reachesSampler = true;
                    if (inputName.includes("model") && currentLinkType === "MODEL") {
                        signals.reachesModel = true;
                    }
                    if (inputName.includes("positive") && currentLinkType === "CONDITIONING") {
                        signals.reachesPositive = true;
                    }
                    if (inputName.includes("negative") && currentLinkType === "CONDITIONING") {
                        signals.reachesNegative = true;
                    }
                    if (/(seed|steps)/.test(inputName) && currentLinkType === "INT") {
                        signals.reachesInt = true;
                    }
                    if (inputName.includes("cfg") && currentLinkType === "FLOAT") {
                        signals.reachesFloat = true;
                    }
                    if (inputName.includes("latent") && currentLinkType === "LATENT") {
                        signals.reachesLatent = true;
                    }
                }
                if (!visited.has(targetNode.id)) {
                    visited.add(targetNode.id);
                    queue.push(targetNode);
                }
            }
        }
    }
    return signals;
}

function asumePrompt(widgetValue) {
    if (typeof widgetValue !== 'string') return { pos: 0, neg: 0 };
    const text = widgetValue.toLowerCase();
    let baseScore = 0;
    let posScore = 0;
    let negScore = 0;
    if (text.length > 15) baseScore += 1;
    if (text.length > 50) baseScore += 1;
    if (/\([\w\s,.-]+:\d*\.?\d+\)/.test(text)) baseScore += 2;
    if (/\[[\w\s,.-]+\]/.test(text)) baseScore += 1;
    if (/\([\w\s,.-]+\)/.test(text)) baseScore += 1;
    if (/\\\([\w\s]+\\\)/.test(text)) posScore += 2, negScore += 1;
    const commaCount = (text.match(/,/g) || []).length;
    if (commaCount >= 3) baseScore += 2;
    if (/<lora:[^:]+:\d*\.?\d+>/.test(text)) posScore += 1;
    const posMarkers = [
        'masterpiece', 'best quality', 'highres', 'painting', 'detailed',
        'realistic', '1girl', '1boy', '4k', '8k', 'raw photo', 'cinematic'
    ];
    for (const marker of posMarkers) {
        if (text.includes(marker)) posScore += 1;
    }
    const negMarkers = [
        'worst quality', 'lowres', 'bad quality', 'low quality', 'normal quality',
        'bad anatomy', 'bad hands', 'missing fingers', 'extra digit', 'fewer digits',
        'mutated', 'deformed', 'ugly', 'poorly drawn',
        'cropped', 'watermark', 'signature', 'text', 'username', 'jpeg artifacts', 'blurry'
    ];
    for (const marker of negMarkers) {
        if (text.includes(marker)) negScore += 1;
    }
    if (text.includes('easynegative') || text.includes('badhand')) negScore += 3;
    if (/embedding:.*(neg|bad).*/.test(text)) negScore += 2;
    if (text.includes('{') && text.includes('}')) baseScore -= 5;
    if (/\.(png|jpg|webp)/.test(text)) baseScore -= 5;
    if (/^[a-zA-Z0-9_/\\]+\.(safetensors|ckpt|pt|pth|bin)$/i.test(text)) baseScore -= 5;

    return {
        pos: Math.max(0, baseScore + posScore),
        neg: Math.max(0, baseScore + negScore)
    };
}

function analyzeWidgets(node, graphCtx) {
    const hints = {
        hasModel: false,
        hasLora: false,
        hasPositive: false,
        hasNegative: false,
        hasPrompt: false,
        hasGenParams: false,
        hasDimensions: false,
    };
    const hasPromptData = graphCtx.promptData?.has(node.id);
    const hasWidgetNames = hasPromptData ? (...names) =>
        Object.keys(graphCtx.promptData.get(node.id).inputs)
            ?.some(o => names.some(name => o.toLocaleLowerCase().includes(name))) : true;
    if (!node.widgets_values || !Array.isArray(node.widgets_values)) {
        return hints;
    }
    for (const value of node.widgets_values) {
        const positive = asumePrompt(value).pos;
        const negative = asumePrompt(value).neg;
        if (typeof value === 'string' && /\.(safetensors|ckpt|pt|pth|sft)$/i.test(value)) {
            hints.hasModel = true;
        }
        if (typeof value === 'string' && /(\.safetensors|lora)/i.test(value)) {
            hints.hasLora = true;
        }

        if (positive >= 3 && positive > negative) {
            hints.hasPositive = true;
        }
        if (negative >= 3 && positive < negative) {
            hints.hasNegative = true;
        }
        if (positive >= 3 || negative >= 3) {
            hints.hasPrompt = true;
        }

        if (typeof value === 'string') {
            if (/(euler|dpmpp|ddim_|lms|normal|simple|karras|exponential|sgm_|ddim_)/i.test(value) && !hints.hasPrompt) {
                hints.hasGenParams = true;
            }
        }

        if (typeof value === 'number' && Number.isInteger(value) && value >= 256 && value <= 4096 && value % 8 === 0) {
            hints.hasDimensions = true;
        }
    }
    if (hasPromptData) {
        if (hints.hasModel && !hasWidgetNames("ckpt", "checkpoint")) {
            hints.hasModel = false;
        }
        if (hints.hasLora && !hasWidgetNames("lora")) {
            hints.hasLora = false;
        }
        if (!hints.hasGenParams && hasWidgetNames("seed", "steps", "cfg", "sampler", "scheduler")) {
            hints.hasGenParams = true;
        }
        if (hints.hasDimensions && !hasWidgetNames("height", "width")) {
            hints.hasDimensions = false;
        }
    }
    return hints;
}

function getStrictMatches(targetNode, graphCtx) {
    const nodes = graphCtx.allActiveNodes;
    const normalizeId = (id) => {
        if (typeof id === "number") return id;
        if (typeof id === "string") {
            const part = id.split(":").pop();
            return Number(part);
        }
        return NaN;
    };
    const exactMatches = nodes.filter(
        (candidate) => normalizeId(candidate.id) === normalizeId(targetNode.id) && candidate.type === targetNode.type
    );
    if (exactMatches.length > 0) {
        return exactMatches;
    }
    return exactMatches;
}

function getNodeRole(node, graphCtx, options = {}) {
    const {
        allowEmptyWidgets = false,
        allowLinkTracing = true,
        allowNoLinks = false,
    } = options;
    const hasWidgetsStrings = node.widgets_values?.some(v => /[\w\d]/.test(v));
    const hasOutLinks = node.outputs.some(o => o.links !== null && o.links.length);
    if (!allowNoLinks && !hasOutLinks) return { role: "unknown", score: 0 };;
    if (!allowEmptyWidgets && !hasWidgetsStrings) return { role: "unknown", score: 0 };;
    let score = {
        unknown: 0,
        model: 0,
        lora: 0,
        prompt: 0,
        positive: 0,
        negative: 0,
        samplerParams: 0,
        latent: 0,
    }
    let scoreModifier = {
        modelWidgetsHints: app.ui.settings.getSettingValue("DnDMetadata.1-Model.WidgetHints"),
        modelDownstreamHints: app.ui.settings.getSettingValue("DnDMetadata.1-Model.DownstreamHints"),
        modelNodeHints: app.ui.settings.getSettingValue("DnDMetadata.1-Model.NodeHints"),
        loraWidgetsHints: app.ui.settings.getSettingValue("DnDMetadata.2-Lora.WidgetHints"),
        loraDownstreamHints: app.ui.settings.getSettingValue("DnDMetadata.2-Lora.DownstreamHints"),
        loraNodeHints: app.ui.settings.getSettingValue("DnDMetadata.2-Lora.NodeHints"),
        promptWidgetsHints: app.ui.settings.getSettingValue("DnDMetadata.3-Prompt.WidgetHints"),
        promptNodeHints: app.ui.settings.getSettingValue("DnDMetadata.3-Prompt.NodeHints"),
        positiveWidgetsHints: app.ui.settings.getSettingValue("DnDMetadata.4-Positive.WidgetHints"),
        positiveDownstreamHints: app.ui.settings.getSettingValue("DnDMetadata.4-Positive.DownstreamHints"),
        positiveNodeHints: app.ui.settings.getSettingValue("DnDMetadata.4-Positive.NodeHints"),
        negativeWidgetsHints: app.ui.settings.getSettingValue("DnDMetadata.5-Negative.WidgetHints"),
        negativeDownstreamHints: app.ui.settings.getSettingValue("DnDMetadata.5-Negative.DownstreamHints"),
        negativeNodeHints: app.ui.settings.getSettingValue("DnDMetadata.5-Negative.NodeHints"),
        samplerParamsWidgetsHints: app.ui.settings.getSettingValue("DnDMetadata.6-SamplerParams.WidgetHints"),
        samplerParamsDownstreamHints: app.ui.settings.getSettingValue("DnDMetadata.6-SamplerParams.DownstreamHints"),
        samplerParamsNodeHints: app.ui.settings.getSettingValue("DnDMetadata.6-SamplerParams.NodeHints"),
        latentWidgetsHints: app.ui.settings.getSettingValue("DnDMetadata.7-Latent.WidgetHints"),
        latentDownstreamHints: app.ui.settings.getSettingValue("DnDMetadata.7-Latent.DownstreamHints"),
        latentNodeHints: app.ui.settings.getSettingValue("DnDMetadata.7-Latent.NodeHints"),
    };
    const type = node?.type.toLowerCase();
    const title = node?.title?.toLowerCase();
    const widgetValues = analyzeWidgets(node, graphCtx);
    let downstream = { reachesPositive: false, reachesNegative: false };
    if (allowLinkTracing) { downstream = getDownstreamSignals(node, graphCtx) };
    const nodeHasAnyKeyword = (keywords, ...fields) =>
        fields.some(v =>
            typeof v === "string" &&
            keywords.some(k => v.toLowerCase().includes(k))
        );
    const outStrings = node.outputs.flatMap(o =>
        [o.name, o.type, o.label].filter(v => typeof v === "string")
    );
    const params = ["seed", "steps", "cfg", "sampler", "scheduler", "noise"];

    score.model += widgetValues.hasModel ? 1 * scoreModifier.modelWidgetsHints : -1;
    if (downstream.reachesModel) score.model += 1 * scoreModifier.modelDownstreamHints;
    score.model += nodeHasAnyKeyword(["checkpoint", "ckpt", "model"], title, type, ...outStrings) ? 1 * scoreModifier.modelNodeHints : -1;

    if (widgetValues.hasLora) score.lora += 1 * scoreModifier.loraWidgetsHints;
    if (downstream.reachesModel) score.lora += 1 * scoreModifier.loraDownstreamHints;
    score.lora += nodeHasAnyKeyword(["lora"], title, type, ...outStrings) ? 1 * scoreModifier.loraNodeHints : -1;

    if (widgetValues.hasPositive) { score.positive += 1 * scoreModifier.positiveWidgetsHints, score.prompt -= 1 } else score.positive -= 1;
    if (downstream.reachesPositive) score.positive += 1 * scoreModifier.positiveDownstreamHints;
    if (nodeHasAnyKeyword(["positive"], title, type)) score.positive += 1 * scoreModifier.positiveNodeHints;

    if (widgetValues.hasNegative) { score.negative += 1 * scoreModifier.negativeWidgetsHints, score.prompt -= 1 } else score.negative -= 1;
    if (downstream.reachesNegative) score.negative += 1 * scoreModifier.negativeDownstreamHints;
    if (nodeHasAnyKeyword(["negative"], title, type)) score.negative += 1 * scoreModifier.negativeNodeHints;

    if (widgetValues.hasPrompt && !widgetValues.hasPositive && !widgetValues.hasNegative) score.prompt += 1 * scoreModifier.promptWidgetsHints;
    if (nodeHasAnyKeyword(["string", "conditioning", "prompt"], title, type)) score.prompt += 1 * scoreModifier.promptNodeHints;

    if (widgetValues.hasGenParams) score.samplerParams += 1 * scoreModifier.samplerParamsWidgetsHints;
    if (downstream.reachesSampler) score.samplerParams += 1 * scoreModifier.samplerParamsDownstreamHints;
    score.samplerParams += nodeHasAnyKeyword(params, title, type) ? 1 * scoreModifier.samplerParamsNodeHints : -1;

    score.latent += widgetValues.hasDimensions ? 1 * scoreModifier.latentWidgetsHints : -2;
    if (downstream.reachesLatent) score.latent += 1 * scoreModifier.latentDownstreamHints;
    score.latent += nodeHasAnyKeyword(["latent"], title, type, ...outStrings) ? 1 * scoreModifier.latentNodeHints : -1;

    const result = Object.entries(score).reduce(
        (max, curr) =>
            curr[1] > max[1] ? curr : max);
    return { role: result[0], score: result[1] };
}

function getRoleMatches(targetNode, graphCtx) {
    const options = {
        allowEmptyWidgets: true,
        allowLinkTracing: false,
        allowNoLinks: true
    };
    const accuracy = app.ui.settings.getSettingValue("DnDMetadata.General.Accuracy");
    const targetRole = getNodeRole(targetNode, graphCtx, options).role;
    if (!targetRole || targetRole === "unknown") {
        return [];
    }
    const candidateNodes = (graphCtx.allActiveNodes || []).filter(candidate => {
        const candidateRole = getNodeRole(candidate, graphCtx);
        if (candidateRole.role === targetRole && candidateRole.score >= accuracy) {
            return true;
        }
        if (
            targetRole === "prompt" &&
            (candidateRole.role === "positive" || candidateRole.role === "negative")
        ) {
            return true;
        }
        return false;
    });

    return candidateNodes;
}

async function chooseNodeFromCandidates(candidates, targetNode, e, graphCtx) {
    return new Promise((resolve) => {
        const existing = document.getElementById("rgthree-primitive-import-menu");
        if (existing) existing.remove();

        const overlay = document.createElement("div");
        overlay.id = "rgthree-primitive-import-menu";

        document.body.appendChild(overlay);
        const menuWidth = 520;
        const menuHeight = Math.min(window.innerHeight * 0.7, candidates.length * 150);
        let left = e.clientX || 8;
        let top = e.clientY || 8;
        const offset = 40;
        if (left + menuWidth > window.innerWidth) {
            left = window.innerWidth - menuWidth - 20;
        }
        if (top + menuHeight > window.innerHeight) {
            top = window.innerHeight - menuHeight - offset;
        }
        overlay.style.left = `${Math.max(8, left)}px`;
        overlay.style.top = `${Math.max(8, top)}px`;

        const title = document.createElement("div");
        title.className = "rgthree-menu-title";
        title.style.cursor = "move";
        title.textContent = "::: Select node to import values from";
        overlay.appendChild(title);
        let isDragging = false;
        let offsetX, offsetY;
        title.onmousedown = (e) => {
            isDragging = true;
            offsetX = e.clientX - overlay.offsetLeft;
            offsetY = e.clientY - overlay.offsetTop;
        };
        window.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            overlay.style.left = `${e.clientX - offsetX}px`;
            overlay.style.top = `${e.clientY - offsetY}px`;
        });
        window.addEventListener("mouseup", () => {
            isDragging = false;
            title.style.background = "";
        });

        const ROLE_COLORS = {
            latent: "#82366b", model: "#4e3573", lora: "#2C8E66",
            positive: "#386641", negative: "#732c2c", samplerParams: "#907130",
            prompt: "#733e2c", unknown: "#333333"
        };
        let selectedValue = null;
        let selectedWidgetEl = null;
        const mapping = {};
        const triggerFlash = (el) => {
            if (!el) return;
            el.classList.remove("flash-apply");
            void el.offsetWidth;
            el.classList.add("flash-apply");
            setTimeout(() => el.classList.remove("flash-apply"), 450);
        };
        const preventImmediateHover = (slotEl) => {
            slotEl.classList.add("no-hover");
            const removeBlock = () => {
                slotEl.classList.remove("no-hover");
                slotEl.removeEventListener("mouseleave", removeBlock);
            };
            slotEl.addEventListener("mouseleave", removeBlock);
            setTimeout(removeBlock, 800);
        };

        const proxyPanel = document.createElement("div");
        proxyPanel.id = "rgthree-mapping-proxy-panel";
        proxyPanel.style.display = "none";

        const proxyTitle = document.createElement("div");
        proxyTitle.className = "rgthree-menu-title";
        proxyTitle.textContent = `Mapping to: ${targetNode.type} (ID: ${targetNode.id})`;
        proxyPanel.appendChild(proxyTitle);
        const proxySlotsElements = [];

        (targetNode.widgets || []).forEach((w, idx) => {
            const slot = document.createElement("div");
            slot.className = "rgthree-proxy-slot";
            slot.innerHTML = `<span class="slot-name">${w.label || w.name || `Widget ${idx}`}</span> <span class="slot-value"></span>`;
            const valueSpan = slot.querySelector(".slot-value");
            proxySlotsElements[idx] = { slot, valueSpan };
            slot.onclick = () => {
                if (mapping[idx] !== undefined) {
                    delete mapping[idx];
                    slot.classList.remove("mapped");
                    valueSpan.textContent = "";
                    return;
                }
                if (selectedValue !== null && selectedWidgetEl) {
                    mapping[idx] = selectedValue;
                    slot.classList.add("mapped");
                    preventImmediateHover(slot);
                    let valText = String(selectedValue);
                    if (typeof selectedValue === 'object') valText = "[Object]";
                    valueSpan.textContent = valText.length > 25 ? ` → ${valText.slice(0, 25)}...` : ` → ${valText}`;
                    triggerFlash(selectedWidgetEl.querySelector(".widget-value"));
                    triggerFlash(slot);
                    if (selectedWidgetEl) {
                        selectedWidgetEl.classList.remove("selected");
                        selectedWidgetEl = null;
                        selectedValue = null;
                    }
                }
            };
            proxyPanel.appendChild(slot);
        });

        const btnApplyManual = document.createElement("button");
        btnApplyManual.className = "rgthree-mock-btn-apply";
        btnApplyManual.textContent = "Apply";
        btnApplyManual.onclick = () => closeMenu({ action: "manual", mapping });
        proxyPanel.appendChild(btnApplyManual);
        const closeMenu = (selectedResult, evt) => {
            if (evt) {
                evt.preventDefault();
                evt.stopPropagation();
                evt.stopImmediatePropagation();
            }
            if (overlay._cleanup) overlay._cleanup();
            overlay.remove();
            proxyPanel.remove();
            resolve(selectedResult || { action: "cancelled" });
        };

        const scrollBox = document.createElement("div");
        scrollBox.className = "rgthree-mock-node-container";
        overlay.appendChild(scrollBox);

        for (const { node, role, score } of candidates) {
            const container = document.createElement("div");
            container.className = "rgthree-mock-node";

            const header = document.createElement("div");
            header.className = "rgthree-mock-node-header";
            header.style.backgroundColor = ROLE_COLORS[role] || ROLE_COLORS.unknown;

            const label = (typeof toNodeLabel === 'function') ? toNodeLabel(node) : (node.type || 'Node');
            header.textContent = `${label}-score[${score}]`;
            header.onclick = (e) => closeMenu({ node, action: "direct" }, e);
            container.appendChild(header);

            const body = document.createElement("div");
            body.className = "rgthree-mock-node-body";
            body.onclick = (e) => {
                if (e.target === body) closeMenu({ node, action: "direct" }, e);
            };

            let nodeInPrompt = graphCtx.promptData.get(node.id) ?? [];
            const promptInputs = nodeInPrompt?.inputs || {};
            const workflowInputsByName = new Map(node.inputs.map(i => [i.name, i]));
            const widgetInputs = Object.entries(promptInputs).reduce((acc, [name, value]) => {
                const wfInput = workflowInputsByName.get(name);
                const label = wfInput?.label ?? "";
                if (!Array.isArray(value) && typeof value !== "object") {
                    acc.push({
                        label,
                        name,
                        value
                    });
                }
                else if (wfInput?.widget) {
                    acc.push({
                        label,
                        name,
                        value: findWidgetValue(value, graphCtx),
                    });
                }
                return acc;
            }, []);
            for (const input of widgetInputs) {
                const val = input.value;
                if (val === undefined || val === null || String(val).trim() === "") continue;
                const widgetName = input.label || input.name || "Widget";
                const text = String(val).trim();
                if (text === "" && !Array.isArray(val)) continue;
                const preview = text.length > 100 ? text.slice(0, 100) + "..." : text;
                const widgetLine = document.createElement("div");
                widgetLine.className = "rgthree-mock-widget";
                let typeClass = "";
                if (typeof val === 'number') {
                    typeClass = "type-number";
                } else if (typeof val === 'string') {
                    typeClass = "type-string";
                }
                widgetLine.innerHTML = `<span class="widget-label">${widgetName}:</span> <span class="widget-value ${typeClass}"></span>`;
                widgetLine.querySelector(".widget-value").textContent = preview;
                widgetLine.onclick = (evt) => {
                    evt.stopPropagation();
                    if (targetNode.widgets && targetNode.widgets.length === 1) {
                        closeMenu({ action: "manual", mapping: { 0: val } }, evt);
                        return;
                    }
                    const matchIdx = (targetNode.widgets || []).findIndex(
                        (w, idx) => w.label === widgetName && !Object.hasOwn(mapping, idx)
                    );
                    if (matchIdx !== -1) {
                        mapping[matchIdx] = val;
                        const pSlot = proxySlotsElements[matchIdx];
                        if (pSlot) {
                            pSlot.slot.classList.add("mapped");
                            let valText = String(val);
                            if (typeof val === 'object') valText = "[Object]";
                            pSlot.valueSpan.textContent = valText.length > 25 ? ` → ${valText.slice(0, 25)}...` : ` → ${valText}`;
                            preventImmediateHover(pSlot.slot);
                            triggerFlash(widgetLine.querySelector(".widget-value"));
                            triggerFlash(pSlot.slot);
                        }
                        if (selectedWidgetEl) {
                            selectedWidgetEl.classList.remove('selected');
                            selectedWidgetEl = null;
                            selectedValue = null;
                        }
                    } else {
                        if (selectedWidgetEl) {
                            selectedWidgetEl.classList.remove('selected');
                        }
                        widgetLine.classList.add("selected");
                        selectedWidgetEl = widgetLine;
                        selectedValue = val;
                    }
                    const menuRect = overlay.getBoundingClientRect();
                    proxyPanel.style.display = "block";
                    proxyPanel.style.left = `${menuRect.right + 20}px`;
                    proxyPanel.style.top = `${menuRect.top}px`;
                };

                body.appendChild(widgetLine);
            }

            if (body.children.length === 0) {
                const emptyMsg = document.createElement("div");
                emptyMsg.className = "rgthree-mock-widget-empty";
                emptyMsg.textContent = "(no widget values)";
                body.appendChild(emptyMsg);
            }

            container.appendChild(body);
            scrollBox.appendChild(container);
        }

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "rgthree-mock-btn-cancel";
        cancelBtn.textContent = "Cancel";
        cancelBtn.onclick = (e) => closeMenu(null, e);
        overlay.appendChild(cancelBtn);

        document.body.appendChild(overlay);
        document.body.appendChild(proxyPanel);

        setTimeout(() => {
            const onOutsideClick = (evt) => {
                const isInsideMenu = overlay.contains(evt.target);
                const isInsideProxy = proxyPanel.contains(evt.target);

                if (!isInsideMenu && !isInsideProxy) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    evt.stopImmediatePropagation();
                    closeMenu({ action: "cancelled" }, evt);
                }
            };

            const onKeydown = (evt) => {
                if (evt.key === "Escape") {
                    closeMenu({ action: "cancelled" }, evt);
                }
            };

            window.addEventListener("pointerdown", onOutsideClick, true);
            window.addEventListener("keydown", onKeydown, true);

            overlay._cleanup = () => {
                window.removeEventListener("pointerdown", onOutsideClick, true);
                window.removeEventListener("keydown", onKeydown, true);
            };
        }, 0);
    });
}

function applyCandidateToNode(targetNode, result) {
    if (!result) return;
    const isManual = result.action === "manual";
    const sourceNode = result.node || (result.widgets_values ? result : null);
    let next = [...(targetNode.widgets_values || [])];

    if (isManual) {
        for (const [idx, value] of Object.entries(result.mapping)) {
            const widget = targetNode.widgets?.[Number(idx)];
            if (!widget) continue;
            widget.value = value;
            widget.callback?.(value);
        }
        targetNode.setDirtyCanvas?.(true, true);
        return;
    }
    else if (sourceNode) {
        const incoming = sourceNode.widgets_values || [];

        for (let i = 0; i < incoming.length; i++) {
            if (Array.isArray(next[i]) && Array.isArray(incoming[i])) {
                next[i] = [...incoming[i]];
            }
            else if (
                typeof next[i] === "object" && next[i] !== null &&
                typeof incoming[i] === "object" && incoming[i] !== null &&
                !Array.isArray(next[i]) && !Array.isArray(incoming[i])
            ) {
                next[i] = { ...next[i], ...incoming[i] };
            }
            else {
                next[i] = incoming[i];
            }
        }
        next.length = incoming.length;
    }
    targetNode.configure({
        title: targetNode.title,
        widgets_values: next
    });
}

export async function importMetaData(node, workflow, prompt, e) {
    if (!workflow || !node.widgets?.length || !isFeatureEnabled()) return false;

    const graphCtx = buildGraphCtx(workflow, prompt);
    const hasWidgetValues = (n) => Array.isArray(n.widgets_values) && n.widgets_values.length > 0;
    const strictCandidates = getStrictMatches(node, graphCtx).filter(hasWidgetValues);
    const roleCandidates = getRoleMatches(node, graphCtx).filter(hasWidgetValues);

    const isCompatible = (t, c) => {
        if (!t || !c) return false;
        const tw = t.widgets || [], cv = c.widgets_values || [];
        if (!Array.isArray(cv)) return false;
        return tw.every((w, i) => {
            const cVal = cv[i];
            if (cVal === undefined) return true;
            if (w.value !== null && cVal !== null && typeof w.value !== typeof cVal) return false;
            return true;
        });
    };

    if (strictCandidates.length === 1) {
        applyCandidateToNode(node, strictCandidates[0]);
        return true;
    }
    if (roleCandidates.length === 1 && isCompatible(node, roleCandidates[0])) {
        applyCandidateToNode(node, roleCandidates[0]);
        return true;
    }
    if (roleCandidates.length > 1 || (roleCandidates.length === 1 && !isCompatible(node, roleCandidates[0]))) {
        const menuItems = roleCandidates.map(n => ({ node: n, role: getNodeRole(n, graphCtx).role, score: getNodeRole(n, graphCtx).score }));
        const chosen = await chooseNodeFromCandidates(menuItems, node, e, graphCtx);
        if (chosen) {
            applyCandidateToNode(node, chosen);
            return true;
        }
        return false;
    }
    if (strictCandidates.length > 1) {
        const menuItems = strictCandidates.map(n => ({ node: n, role: getNodeRole(n, graphCtx).role, score: getNodeRole(n, graphCtx).score }));
        const chosen = await chooseNodeFromCandidates(menuItems, node, e, graphCtx);
        if (chosen) {
            applyCandidateToNode(node, chosen);
            return true;
        }
        return false;
    }
    return false;
}
// Majoor integration //
export async function importMetaDataFromPayload(node, payload, e) {
    if (!payload?.filename) return false;

    const viewUrl = `/view?filename=${encodeURIComponent(payload.filename)}&type=${encodeURIComponent(payload.type || "output")}&subfolder=${encodeURIComponent(payload.subfolder || "")}`;
    if (payload.root_id) {
        viewUrl += `&root_id=${encodeURIComponent(payload.root_id)}`;
    }

    const response = await fetch(viewUrl);
    if (!response.ok) return false;
    const buffer = await response.arrayBuffer();
    const { workflow, prompt } = extractMetaDataFromBuffer(buffer);
    if (!workflow) return false;

    return importMetaData(node, workflow, prompt, e);
}

if (isFeatureEnabled()) {
    window.__dragAndDropMetaData = {
        importMetaDataFromPayload: importMetaDataFromPayload
    }
};
