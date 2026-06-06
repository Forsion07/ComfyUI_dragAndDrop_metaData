import { app } from "../../scripts/app.js";
import { pickBestMediaPathWidget } from "./Majoor-functions.js";

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

function nodeFlash(node, mode = "succes") {

    const flash = document.createElement("div");
    flash.className = "DnDMetaData-node-flash";
    if (mode === "fail") {
        flash.classList.add("fail");
    } else {
        flash.classList.add("success");
    }
    document.body.appendChild(flash);

    const start = performance.now();
    const duration = 500;
    const titleHeight = LiteGraph.NODE_TITLE_HEIGHT;

    function update() {
        const canvas = app.canvas.canvas;
        const rect = canvas.getBoundingClientRect();
        const scale = app.canvas.ds.scale;
        const offset = app.canvas.ds.offset;

        flash.style.left =
            rect.left +
            (node.pos[0] + offset[0]) * scale +
            "px";

        flash.style.top =
            rect.top +
            (node.pos[1] + offset[1]) * scale -
            titleHeight * scale +
            "px";

        flash.style.width =
            node.size[0] * scale + "px";

        flash.style.height =
            (node.size[1] + titleHeight) * scale + "px";

        if (performance.now() - start < duration) {
            requestAnimationFrame(update);
        } else {
            flash.remove();
        }
    }
    update();
}

// I+Drag //
let iDrag = false;
let iDragModeEnabled = false;

const onKeyDown = (e) => {
    if (e.key?.toLowerCase() === "i") {
        iDrag = true;
    }
};

const onKeyUp = (e) => {
    if (e.key?.toLowerCase() === "i") {
        iDrag = false;
    }
};

const onBlur = () => {
    iDrag = false;
};

function enableIDragMode() {
    if (iDragModeEnabled) return;

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);

    iDragModeEnabled = true;
}

function disableIDragMode() {
    if (!iDragModeEnabled) return;

    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", onBlur);

    iDrag = false;
    iDragModeEnabled = false;
}

function isFeatureEnabled() {
    const mode = app.ui.settings.getSettingValue("DnDMetadata.General.mode");
    if (mode === "off") return false;
    return true;
}

function isFeatureActive() {
    const mode = app.ui.settings.getSettingValue("DnDMetadata.General.mode");
    if (mode === "off") return false;
    if (mode === "i+drag") return iDrag;
    return true;
}
// Settings //
const hintSettings = [
    ["1-Model", { WidgetHints: 2, DownstreamHints: 1, NodeHints: 1 }],
    ["2-Lora", { WidgetHints: 1, DownstreamHints: 1, NodeHints: 2 }],
    ["3-Prompt", { WidgetHints: 1, NodeHints: 1 }],
    ["4-Positive", { WidgetHints: 1, DownstreamHints: 1, NodeHints: 3 }],
    ["5-Negative", { WidgetHints: 1, DownstreamHints: 1, NodeHints: 3 }],
    ["6-SamplerParams", { WidgetHints: 1, DownstreamHints: 1, NodeHints: 1 }],
    ["7-Latent", { WidgetHints: 1, DownstreamHints: 1, NodeHints: 1 }],
];

function updateSingleResetButton(settingId, defaultValue, newValue) {
    const row = document.querySelector(`[data-setting-id="${settingId}"]`);
    const btn = row?.querySelector(".DnDMetaData-settings-resetButton-individual");
    if (!btn) return;
    btn.classList.toggle("nonDefault", newValue !== defaultValue);
}

function settingTemplate (group, name, DValue) {
    const id = `DnDMetadata.${group}.${name}`;
    return {
        id: id,
        name: name,
        defaultValue: DValue,
        type: "slider",
        attrs: { min: 1, max: 5, step: 1 },
        onChange: (newVal,) => {
            updateSingleResetButton(id, DValue, newVal);
        }
    }
}
const SETTINGS = hintSettings.flatMap(([group, hints]) =>
    Object.entries(hints).map(([name, DValue]) =>
        settingTemplate(group, name, DValue)
    )
);
SETTINGS.push(
    {
        id: "DnDMetadata.General.Accuracy",
        name: "🎯 Accuracy",
        defaultValue: 0,
        type: "slider",
        attrs: { min: 0, max: 5, step: 1 },
        tooltip: "Filters out roles with a score lower than given number"
    },
    {
        id: "DnDMetadata.General.multiRoleAccuracy",
        name: "🎯 MultiRoleAccuracy",
        defaultValue: 2,
        type: "slider",
        attrs: { min: 0, max: 5, step: 1 },
        tooltip: "Filters out roles for multiRole with a score lower than given number"
    },
)

const DND_MIME = "application/x-mjr-asset";

app.registerExtension({
    name: "dragAndDrop_metaData",
    settings: [
        {
            id: "DnDMetadata.General.mode",
            name: "Activation mode",
            type: "combo",
            defaultValue: "i+drag",
            options: [
                { text: "auto", value: "auto" },
                { text: "I+Drag", value: "i+drag" },
                { text: "Off", value: "off" }
            ],
            tooltip: "Choose when to import metadata from PNG on drop.",
            onChange: (newVal) => {
                if (newVal === "i+drag") {
                    enableIDragMode();
                } else {
                    disableIDragMode();
                }
            }
        },
        {
            id: "DnDMetadata.ResetButton",
            name: "Reset All Settings",
            type: "text",
        },
        ...SETTINGS
    ],
    // onDrag patch //
    async beforeRegisterNodeDef(nodeType) {
        const origOnDragDrop = nodeType.prototype.onDragDrop;
        const origOnDragOver = nodeType.prototype.onDragOver;
        nodeType.prototype.onDragOver = function (e) {
            const handled = origOnDragOver?.apply(this, arguments);
            if (handled != null) {
                return handled;
            }
            if (e.dataTransfer?.types.includes(DND_MIME)) return isFeatureActive();
            return isFeatureEnabled();
        };
        nodeType.prototype.onDragDrop = async function (e) {
            const handled = await origOnDragDrop?.apply(this, arguments);
            const files = e.dataTransfer?.files;
            if (!files?.length) {
                nodeFlash(node, "fail");
                return handled;
            }
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
        // Settings buttons //
        function injectResetButton() {
            const row = document.querySelector('[data-setting-id="DnDMetadata.ResetButton"]');
            if (!row || row.dataset.injected) return;
            row.dataset.injected = "true";
            const inputContainer = row.querySelector(".form-input");
            if (!inputContainer) return;
            inputContainer.innerHTML = "";

            const resetBtnM = document.createElement("button");
            resetBtnM.classList.add("DnDMetaData-settings-resetButton-main");
            resetBtnM.textContent = "Reset Settings";
            resetBtnM.onclick = async () => {
                for (const setting of SETTINGS) {
                    await app.ui.settings.setSettingValue(
                        setting.id,
                        setting.defaultValue
                    );
                }
            };
            inputContainer.appendChild(resetBtnM);
        };

        function injectIndividualResetButtons() {
            for (const setting of SETTINGS) {
                const row = document.querySelector(`[data-setting-id="${setting.id}"]`);
                if (!row || row.dataset.resetInjected) continue;
                row.dataset.resetInjected = "true";
                const inputContainer = row.querySelector(".form-input");
                if (!inputContainer) continue;

                const resetBtn = document.createElement("button");
                resetBtn.classList.add("DnDMetaData-settings-resetButton-individual");
                resetBtn.innerHTML = "↺";
                resetBtn.title = "Reset to default";
                const currentValue = app.ui.settings.getSettingValue(setting.id);
                resetBtn.classList.toggle(
                    "nonDefault",
                    currentValue !== setting.defaultValue
                );
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
                if (e.dataTransfer?.types.includes(DND_MIME)) return isFeatureActive();
                return isFeatureEnabled();
            };
            proto.onDragDrop = async function (e) {
                const handled = await origDrop?.apply(this, arguments);
                if (handled === true) {
                    return true;
                }
                const files = e.dataTransfer?.files;
                if (!files?.length) {
                    nodeFlash(node, "fail");
                    return handled;
                };
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

        // Majoor-Assets-Manager patch //
        let justAppliedMetadata = false;
        const highlightState = new WeakMap();

        function getHighlightState(app) {
            let state = highlightState.get(app);
            if (!state) {
                state = { node: null, prev: null };
                highlightState.set(app, state);
            }
            return state;
        }

        function applyHighlight(app, node) {
            const state = getHighlightState(app);
            if (!node || state.node === node) return;
            clearHighlight(app);
            state.node = node;
            state.prev = {
                color: node.color,
                bgcolor: node.bgcolor,
            };
            node.bgcolor = "#FFB533";
            node.color = "#FFEAA9";
            app.canvas.setDirty(true, true);
        }

        function clearHighlight(app) {
            const state = getHighlightState(app);
            if (!state.node) return;
            try {
                state.node.color = state.prev.color;
                state.node.bgcolor = state.prev.bgcolor;
            } catch { }
            state.node = null;
            state.prev = null;
            app.canvas.setDirty(true, true);
        }

        function getNodeUnderClientXY(app, event) {
            const canvasEl = document.querySelector('canvas');
            if (!app?.canvas || !canvasEl) return null;
            const rect = canvasEl.getBoundingClientRect();
            const scale = app.canvas.ds?.scale ?? 1;
            const offset = app.canvas.ds?.offset ?? [0, 0];
            const x = (event.clientX - rect.left) / scale - offset[0];
            const y = (event.clientY - rect.top) / scale - offset[1];
            return app.canvas.graph.getNodeOnPos(x, y);
        }

        async function fetchWorkflowAndPrompt(payload) {
            const viewUrl = `/api/view?filename=${encodeURIComponent(payload.filename)}&type=${encodeURIComponent(payload.type)}&subfolder=${encodeURIComponent(payload.subfolder || "")}`;
            const response = await fetch(viewUrl);
            if (!response.ok) return null;
            const buffer = await response.arrayBuffer();
            return extractMetaDataFromBuffer(buffer);
        }

        const onGlobalDragOver = (event) => {
            if (!isFeatureEnabled()) return;
            if (!isFeatureActive()) return;
            if (!event.dataTransfer?.types.includes(DND_MIME)) return;
            let payload;
            try {
                const raw = event.dataTransfer.getData(DND_MIME);
                if (!raw) return;
                payload = JSON.parse(raw);
            } catch { return; }
            const node = getNodeUnderClientXY(app, event);
            const droppedExt = String(payload.filename).split(".").pop() || "";
            const widget = pickBestMediaPathWidget(node, payload, droppedExt);
            if (node && !widget) {
                event.preventDefault();
                event.stopImmediatePropagation();
                applyHighlight(app, node);
            } else {
                clearHighlight(app);
            }
        };

        const onGlobalDragLeave = () => {
            clearHighlight(app);
        };

        const onGlobalDrop = async (event) => {
            if (!isFeatureEnabled()) return;
            if (!isFeatureActive()) return;
            if (!event.dataTransfer?.types.includes(DND_MIME)) return;
            clearHighlight(app);
            justAppliedMetadata = true;
            let payload;
            try {
                const raw = event.dataTransfer.getData(DND_MIME);
                if (!raw) return;
                payload = JSON.parse(raw);
            } catch { return; }
            if (!payload?.filename) return;
            const node = getNodeUnderClientXY(app, event);
            if (!node) return;
            const droppedExt = String(payload.filename).split(".").pop() || "";
            const canAcceptFile =
                !!pickBestMediaPathWidget(
                    node,
                    payload,
                    droppedExt
                );
            if (canAcceptFile) {
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            const meta = await fetchWorkflowAndPrompt(payload);
            if (meta?.workflow) {
                await importMetaData(node, meta.workflow, meta.prompt, event);
            } else {
                nodeFlash(node, "fail");
            }
        };

        const onGlobalDragEnd = (e) => {
            if (justAppliedMetadata) {
                e.preventDefault();
                e.stopImmediatePropagation();
                justAppliedMetadata = false;
            }
        };

        window.addEventListener("dragover", onGlobalDragOver, true);
        window.addEventListener("dragleave", onGlobalDragLeave, true);
        window.addEventListener('drop', onGlobalDrop, true);
        window.addEventListener('dragend', onGlobalDragEnd, true);
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
    const inActiveSub = (node) => {
        if (typeof node.id === "string") {
            const getSuProxyNodebId = parseInt(node.id, 10);
            return subsProxyNodesById.get(getSuProxyNodebId).mode === 0 ?? false;
        }
        return true
    }
    const allNodesById = new Map(allNodes.map(n => [n.id, n]));
    const allActiveNodes = allNodes.filter(n => n.mode === 0 && inActiveSub(n));
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
    const defaultRole = { multiRole: [], name: "unknown", score: 0 };
    if (!allowNoLinks && !hasOutLinks) return defaultRole;
    if (!allowEmptyWidgets && !hasWidgetsStrings) return defaultRole;
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
    const multiRoleAccuracy = app.ui.settings.getSettingValue("DnDMetadata.General.multiRoleAccuracy")
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

    const roles = Object.entries(score)
        .sort((a, b) => b[1] - a[1])
        .map(([name, score]) => ({ name, score }));
    const mainRole = roles[0];
    const multiRole = mainRole.score > 0 ? roles.filter(r => r.score > 0 && mainRole.score - r.score <= multiRoleAccuracy) : [];
    return { multiRole, name: mainRole.name, score: mainRole.score };
}

function getRoleMatches(targetNode, graphCtx) {
    const options = {
        allowEmptyWidgets: true,
        allowLinkTracing: false,
        allowNoLinks: true
    };
    const accuracy = app.ui.settings.getSettingValue("DnDMetadata.General.Accuracy");
    const targetRole = getNodeRole(targetNode, graphCtx, options);
    if (!targetRole || targetRole.name === "unknown") {
        return [];
    }
    const candidateNodes = (graphCtx.allActiveNodes || []).filter(candidate => {
        const candidateRole = getNodeRole(candidate, graphCtx);
        const roleMatch = targetRole.multiRole.some(tRole => candidateRole.score >= accuracy && tRole.name === candidateRole.name);
        if (roleMatch) {
            return true;
        }
        if (
            targetRole.name === "prompt" &&
            (candidateRole.name === "positive" || candidateRole.name === "negative")
        ) {
            return true;
        }
        return false;
    });

    return candidateNodes;
}

function buildRoleGradient(multiRole) {
    const ROLE_COLORS = {
        latent: "#82366b", model: "#4e3573", lora: "#2C8E66",
        positive: "#386641", negative: "#732c2c", samplerParams: "#907130",
        prompt: "#733e2c", unknown: "#333333"
    };
    const totalScore = multiRole.reduce((sum, role) => sum + role.score,0);
    let currentPercent = 0;
    const stops = multiRole.map(role => {
        currentPercent += (role.score / totalScore) * 100;
        return `${ROLE_COLORS[role.name] || ROLE_COLORS.unknown} ${currentPercent}%`;
    });
    return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function fitToViewport(element, scrollContainer) {
    const SCREEN_MARGIN = 8;
    const MIN_LIST_HEIGHT = 250;
    const reservedSpace =
        element.offsetHeight -
        scrollContainer.offsetHeight;
    const rect = element.getBoundingClientRect();
    const maxAvailableHeight =
        window.innerHeight -
        rect.top -
        SCREEN_MARGIN;
    const targetHeight = Math.max(
        MIN_LIST_HEIGHT,
        maxAvailableHeight - reservedSpace
    );

    scrollContainer.style.maxHeight = `${targetHeight}px`;
    const newRect = element.getBoundingClientRect();
    const maxTop =
        window.innerHeight -
        newRect.height -
        SCREEN_MARGIN;

    if (newRect.top > maxTop) {
        element.style.top =
            `${Math.max(
                SCREEN_MARGIN,
                maxTop
            )}px`;
    }
}

function keepInsideViewport(element) {
    const SCREEN_MARGIN = 8;
    const naturalHeight = element.getBoundingClientRect().height;
    const currentTop = element.getBoundingClientRect().top;
    const maxBottom = window.innerHeight - SCREEN_MARGIN;

    if (currentTop + naturalHeight <= maxBottom) {
        return;
    }

    const newTop = maxBottom - naturalHeight;

    if (newTop >= SCREEN_MARGIN) {
        element.style.top = newTop + 'px';
    } else {
        element.style.top = SCREEN_MARGIN + 'px';
        element.style.maxHeight = (window.innerHeight - 2 * SCREEN_MARGIN) + 'px';
    }
}

const PANEL_ANIM_MS = 220;

function showPanel(panel) {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => panel.classList.remove("hidden"));
    });
}

function hidePanel(panel) {
    return new Promise((resolve) => {
        if (panel.classList.contains("hidden")) {
            resolve();
            return;
        }
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            panel.removeEventListener("transitionend", onEnd);
            resolve();
        };
        const onEnd = (evt) => {
            if (evt.target === panel && evt.propertyName === "opacity") finish();
        };
        panel.addEventListener("transitionend", onEnd);
        panel.classList.add("hidden");
        setTimeout(finish, PANEL_ANIM_MS + 40);
    });
}

async function chooseNodeFromCandidates(candidates, targetNode, e, graphCtx) {
    return new Promise((resolve) => {
        document.getElementById("DnDMetaData-nodeMenu-container")?.remove();
        document.getElementById("DnDMetaData-proxy-node-container")?.remove();

        let settled = false;
        let dragState = null;

        const onMouseMove = (evt) => {
            if (!dragState) return;
            const { element, offsetX, offsetY, onMove } = dragState;
            element.style.left = Math.max(8, evt.clientX - offsetX) + 'px';
            element.style.top = Math.max(8, evt.clientY - offsetY) + 'px';
            onMove?.();
        };

        const onMouseUp = () => {
            if (!dragState) return;
            dragState.handle.style.background = "";
            dragState = null;
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        function makeDraggable(handle, onMove) {
            handle.addEventListener('mousedown', (e) => {
                const draggable = handle.closest('.draggable-panel');
                if (!draggable) return;
                dragState = {
                    element: draggable,
                    offsetX: e.clientX - draggable.offsetLeft,
                    offsetY: e.clientY - draggable.offsetTop,
                    handle,
                    onMove,
                };
            });
        }
        const dropX = e?.clientX ?? window.innerWidth / 2;
        const dropY = e?.clientY ?? window.innerHeight / 2;

        const nodeMenuContainer = document.createElement("div");
        nodeMenuContainer.id = "DnDMetaData-nodeMenu-container";
        nodeMenuContainer.classList.add("draggable-panel");
        nodeMenuContainer.style.left = `${dropX}px`;
        nodeMenuContainer.style.top = `${dropY}px`;
        document.body.appendChild(nodeMenuContainer);

        const nodeMenu = document.createElement("div");
        nodeMenu.id = "DnDMetaData-nodeMenu";
        nodeMenu.classList.add("hidden");
        nodeMenuContainer.appendChild(nodeMenu);

        const title = document.createElement("div");
        title.className = "DnDMetaData-menu-title";
        title.style.cursor = "move";
        title.textContent = "::: Select node to import values from";
        nodeMenu.appendChild(title);
        makeDraggable(title, () => fitToViewport(nodeMenuContainer, nodeMenuScrollContainer));

        let selectedValue = null;
        let selectedWidgetEl = null;
        const mapping = {};
        const nodeFlash = (el) => {
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
        const proxyPanelContainer = document.createElement("div");
        proxyPanelContainer.id = "DnDMetaData-proxy-node-container";
        proxyPanelContainer.classList.add("draggable-panel");

        const proxyPanel = document.createElement("div");
        proxyPanel.id = "DnDMetaData-proxy-node";
        proxyPanel.classList.add("hidden");
        proxyPanelContainer.appendChild(proxyPanel);
        //proxyPanel.style.display = "none";

        const proxyTitle = document.createElement("div");
        proxyTitle.className = "DnDMetaData-menu-title";
        proxyTitle.textContent = `Mapping to: ${targetNode.type} (ID: ${targetNode.id})`;
        proxyTitle.style.cursor = "move";
        proxyPanel.appendChild(proxyTitle);
        const proxySlotsElements = [];
        makeDraggable(proxyTitle, () => fitToViewport(proxyPanelContainer, proxyWidgetsContainer));

        const proxyWidgetsContainer = document.createElement("div");
        proxyWidgetsContainer.className = "DnDMetaData-proxy-widgets-container";
        proxyPanel.appendChild(proxyWidgetsContainer);

        (targetNode.widgets || []).forEach((w, idx) => {
            const slot = document.createElement("div");
            slot.className = "DnDMetaData-proxy-slot";
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
                    nodeFlash(selectedWidgetEl.querySelector(".widget-value"));
                    nodeFlash(slot);
                    if (selectedWidgetEl) {
                        selectedWidgetEl.classList.remove("selected");
                        selectedWidgetEl = null;
                        selectedValue = null;
                    }
                }
            };
            proxyWidgetsContainer.appendChild(slot);
        });

        const btnApplyManual = document.createElement("button");
        btnApplyManual.className = "DnDMetaData-mock-btn-apply";
        btnApplyManual.textContent = "Apply";
        btnApplyManual.onclick = () => closeMenu({ action: "manual", mapping });
        proxyPanel.appendChild(btnApplyManual);
        const closeMenu = (selectedResult, evt) => {
            if (settled) return;
            settled = true;
            if (evt) {
                evt.preventDefault();
                evt.stopPropagation();
                evt.stopImmediatePropagation();
            }
            nodeMenuContainer._cleanup?.();
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            const panelsToHide = [nodeMenu];
            if (!proxyPanel.classList.contains("hidden")) {
                panelsToHide.push(proxyPanel);
            }
            const result = selectedResult ?? { action: "cancelled" };
            Promise.all(panelsToHide.map(hidePanel)).then(() => {
                nodeMenuContainer.remove();
                if (proxyPanelContainer.isConnected) {
                    proxyPanelContainer.remove();
                }
                resolve(result);
            });
        };

        const nodeMenuScrollContainer = document.createElement("div");
        nodeMenuScrollContainer.className = "DnDMetaData-mock-node-container";
        nodeMenu.appendChild(nodeMenuScrollContainer);

        for (const { node, role } of candidates) {
            const container = document.createElement("div");
            container.className = "DnDMetaData-mock-node";

            const header = document.createElement("div");
            header.className = "DnDMetaData-mock-node-header";
            header.style.background = buildRoleGradient(role.multiRole);

            const label = (typeof toNodeLabel === 'function') ? toNodeLabel(node) : (node.type || 'Node');
            header.textContent = `${label}-score[${role.score}]`;
            header.onclick = (e) => closeMenu({ node, action: "direct" }, e);
            container.appendChild(header);

            const body = document.createElement("div");
            body.className = "DnDMetaData-mock-node-body";
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
                widgetLine.className = "DnDMetaData-mock-widget";
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
                            nodeFlash(widgetLine.querySelector(".widget-value"));
                            nodeFlash(pSlot.slot);
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
                    const menuRect = nodeMenuContainer.getBoundingClientRect();
                    const newLeft = `${menuRect.right + 20}px`;
                    const newTop = `${menuRect.top}px`;

                    if (!proxyPanel.classList.contains('hidden')) return;

                    requestAnimationFrame(() => {
                        if (!proxyPanelContainer.isConnected) {
                            document.body.appendChild(proxyPanelContainer);
                        }
                        proxyPanelContainer.style.left = newLeft;
                        proxyPanelContainer.style.top = newTop;
                        keepInsideViewport(proxyPanelContainer);
                        requestAnimationFrame(() => showPanel(proxyPanel));
                    });
                };

                body.appendChild(widgetLine);
            }

            if (body.children.length === 0) {
                const emptyMsg = document.createElement("div");
                emptyMsg.className = "DnDMetaData-mock-widget-empty";
                emptyMsg.textContent = "(no widget values)";
                body.appendChild(emptyMsg);
            }

            container.appendChild(body);
            nodeMenuScrollContainer.appendChild(container);
        }

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "DnDMetaData-mock-btn-cancel";
        cancelBtn.textContent = "Cancel";
        cancelBtn.onclick = (e) => closeMenu(null, e);
        nodeMenu.appendChild(cancelBtn);

        requestAnimationFrame(() => {
            fitToViewport(nodeMenuContainer, nodeMenuScrollContainer);
            requestAnimationFrame(() => showPanel(nodeMenu));
        });

        setTimeout(() => {
            const onOutsideClick = (evt) => {
                const isInsideMenu = nodeMenuContainer.contains(evt.target);
                const isInsideProxy = proxyPanelContainer.contains(evt.target);

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

            nodeMenuContainer._cleanup = () => {
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
    if (!workflow || !node.widgets?.length || !isFeatureEnabled()) {
        nodeFlash(node, "fail");
        return false;
    };

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
        nodeFlash(node);
        return true;
    }
    if (roleCandidates.length === 1 && isCompatible(node, roleCandidates[0])) {
        applyCandidateToNode(node, roleCandidates[0]);
        nodeFlash(node);
        return true;
    }
    if (roleCandidates.length > 1 || (roleCandidates.length === 1 && !isCompatible(node, roleCandidates[0]))) {
        const menuItems = roleCandidates.map(n => ({ node: n, role: getNodeRole(n, graphCtx) }));
        const chosen = await chooseNodeFromCandidates(menuItems, node, e, graphCtx);
        if (chosen?.action && chosen.action !== "cancelled") {
            applyCandidateToNode(node, chosen);
            nodeFlash(node);
        } else {
            nodeFlash(node, "fail");
        };
        return true;
    }
    if (strictCandidates.length > 1) {
        const menuItems = strictCandidates.map(n => ({ node: n, role: getNodeRole(n, graphCtx) }));
        const chosen = await chooseNodeFromCandidates(menuItems, node, e, graphCtx);
        if (chosen?.action && chosen.action !== "cancelled") {
            applyCandidateToNode(node, chosen);
            nodeFlash(node);
        } else {
            nodeFlash(node, "fail");
        };
        return true;
    }
    nodeFlash(node, "fail");
    return false;
}
// Majoor integration //
// export async function importMetaDataFromPayload(node, payload, e) {
//     if (!payload?.filename) return false;
//     console.log("Payload", payload);
//     const viewUrl = `/view?filename=${encodeURIComponent(payload.filename)}&type=${encodeURIComponent(payload.type || "output")}&subfolder=${encodeURIComponent(payload.subfolder || "")}`;
//     if (payload.root_id) {
//         viewUrl += `&root_id=${encodeURIComponent(payload.root_id)}`;
//     }

//     const response = await fetch(viewUrl);
//     if (!response.ok) return false;
//     const buffer = await response.arrayBuffer();
//     const { workflow, prompt } = extractMetaDataFromBuffer(buffer);
//     if (!workflow) return false;

//     return importMetaData(node, workflow, prompt, e);
// }

// if (isFeatureEnabled()) {
//     window.__dragAndDropMetaData = {
//         importMetaDataFromPayload: importMetaDataFromPayload,
//         isFeatureActive: isFeatureActive
//     }
// };
