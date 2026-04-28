const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
// --- читаем PNG и вытаскиваем текстовые чанки ---
function extractTextChunks(buffer) {
    const results = [];
    let offset = 8;

    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString("ascii", offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;

        if (type === "tEXt" || type === "iTXt") {
            const chunkData = buffer.slice(dataStart, dataEnd);

            try {
                if (type === "tEXt") {
                    const text = chunkData.toString("utf8");
                    const nullIndex = text.indexOf("\0");
                    if (nullIndex !== -1) {
                        const key = text.slice(0, nullIndex);
                        const value = text.slice(nullIndex + 1);
                        results.push({ key, value });
                    }
                }

                if (type === "iTXt") {
                    const text = chunkData.toString("utf8");
                    const parts = text.split("\0");
                    const key = parts[0];
                    const value = parts.slice(-1)[0];
                    results.push({ key, value });
                }
            } catch (e) {
                // игнор
            }
        }

        offset = dataEnd + 4;
    }

    return results;
}
// --- ищем workflow ---
function extractComfyWorkflow(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error("Файл не найден:", filePath);
        return null;
    }

    const buffer = fs.readFileSync(filePath);
    const chunks = extractTextChunks(buffer);
    let workflow = null;

    for (const chunk of chunks) {
        const value = chunk.value.trim();

        if (value.startsWith("{") || value.startsWith("[")) {
            try {
                const parsed = JSON.parse(value);
                if (parsed.nodes || parsed.workflow || parsed.prompt) {
                    workflow = parsed.workflow || parsed;
                    const nodes = workflow?.nodes ?? [];
                    const nodesById = new Map(nodes.map((node) => [node.id, node]));
                    const lLinks = Array.isArray(workflow?.links) ? workflow.links : [];
                    const workflowString = JSON.stringify(workflow, null, 2);

                    return { workflow, nodes, nodesById, lLinks };
                }
            } catch (e) {
                // не JSON
            }
        }
    }
    return null;
}
function normalizeText(value) {
    return `${value !== null && value !== void 0 ? value : ""}`.trim().toLowerCase();
}
function buildGraphContext(workflow) {
    const nodes = workflow?.nodes ?? [];
    const subgraphs = workflow?.definitions?.subgraphs ?? [];

    // Сопоставляем внешнюю ноду-сабграф с её определением
    const subgraphByNodeId = new Map();
    for (const node of nodes) {
        const sub = subgraphs.find(sg => sg.id === node.type);
        if (sub) {
            subgraphByNodeId.set(node.id, { node, sub });
        }
    }

    const allNodes = [];
    const allLinks = []; // итоговые объекты связей

    const idMap = new Map();        // старый id узла → новый id (внутренние ноды)
    const linkIdRemap = new Map();  // старый id связи → новый id связи

    // ---------- 1. Внешние узлы (не сабграфы) ----------
    for (const node of nodes) {
        if (subgraphByNodeId.has(node.id)) continue;
        allNodes.push({ ...node });
    }

    // ---------- 2. Внутренние узлы сабграфов ----------
    for (const [, { sub }] of subgraphByNodeId.entries()) {
        const prefix = `sub_${sub.id}_`;
        if (sub.nodes) {
            for (const innerNode of sub.nodes) {
                const newId = prefix + innerNode.id;
                allNodes.push({ ...innerNode, id: newId });
                idMap.set(String(innerNode.id), newId);
            }
        }
    }

    // ---------- 3. Обработка внешних связей с перенаправлением ----------
    const externalLinks = Array.isArray(workflow?.links) ? workflow.links : [];
    const allIds = [...allLinks.map(l => l.id), ...externalLinks.map(l => l[0])];
    let nextLinkId = Math.max(...allIds, 0) + 1;

    // Маппинг внутренних связей по id для быстрого поиска
    const subLinkMap = new Map();
    for (const [, { sub }] of subgraphByNodeId.entries()) {
        if (sub.links) {
            for (const raw of sub.links) {
                const link = Array.isArray(raw)
                    ? { id: raw[0], origin_id: raw[1], origin_slot: raw[2], target_id: raw[3], target_slot: raw[4], type: raw[5] }
                    : { ...raw };
                subLinkMap.set(link.id, link);
            }
        }
    }

    for (const rawLink of externalLinks) {
        if (!Array.isArray(rawLink) || rawLink.length < 5) continue;

        const linkObj = {
            id: rawLink[0],
            origin_id: rawLink[1],
            origin_slot: rawLink[2],
            target_id: rawLink[3],
            target_slot: rawLink[4],
            type: rawLink[5],
        };

        const originIsSubgraph = subgraphByNodeId.has(linkObj.origin_id);
        const targetIsSubgraph = subgraphByNodeId.has(linkObj.target_id);

        // Если оба конца не сабграфы, добавляем как есть
        if (!originIsSubgraph && !targetIsSubgraph) {
            allLinks.push(linkObj);
            continue;
        }

        // --- Обработка origin (выход из сабграфа) ---
        let originLinks = [];
        if (originIsSubgraph) {
            const sgInfo = subgraphByNodeId.get(linkObj.origin_id);
            const outerNode = sgInfo.node;   // внешняя нода-сабграф
            const sub = sgInfo.sub;

            // Получаем имя внешнего выхода по слотам
            const outerOutput = outerNode.outputs?.[linkObj.origin_slot];
            if (outerOutput && outerOutput.name) {
                // Ищем внутренний выход с таким же именем
                const innerOutput = sub.outputs?.find(o => o.name === outerOutput.name);
                if (innerOutput && innerOutput.linkIds) {
                    originLinks = innerOutput.linkIds
                        .map(lid => subLinkMap.get(lid))
                        .filter(Boolean);
                }
            }
            if (originLinks.length === 0) continue;
        } else {
            // origin не сабграф – используем сам linkObj как единственный источник
            originLinks = [linkObj];
        }

        // --- Обработка target (вход в сабграф) ---
        let targetLinks = [];
        if (targetIsSubgraph) {
            const sgInfo = subgraphByNodeId.get(linkObj.target_id);
            const outerNode = sgInfo.node;
            const sub = sgInfo.sub;

            const outerInput = outerNode.inputs?.[linkObj.target_slot];
            if (outerInput && outerInput.name) {
                const innerInput = sub.inputs?.find(i => i.name === outerInput.name);
                if (innerInput && innerInput.linkIds) {
                    targetLinks = innerInput.linkIds
                        .map(lid => subLinkMap.get(lid))
                        .filter(Boolean);
                }
            }
            if (targetLinks.length === 0) continue;
        } else {
            targetLinks = [linkObj];
        }

        // Декартово произведение для ответвлений
        for (const oLink of originLinks) {
            for (const tLink of targetLinks) {
                const newId = nextLinkId++;
                const resolved = {
                    id: newId,
                    origin_id: originIsSubgraph
                        ? (idMap.get(String(oLink.origin_id)) ?? oLink.origin_id)
                        : linkObj.origin_id,
                    origin_slot: originIsSubgraph ? oLink.origin_slot : linkObj.origin_slot,
                    target_id: targetIsSubgraph
                        ? (idMap.get(String(tLink.target_id)) ?? tLink.target_id)
                        : linkObj.target_id,
                    target_slot: targetIsSubgraph ? tLink.target_slot : linkObj.target_slot,
                    type: originIsSubgraph ? oLink.type : tLink.type,
                };

                allLinks.push(resolved);
                linkIdRemap.set(oLink.id, newId);
                linkIdRemap.set(tLink.id, newId);
            }
        }
    }

    // ---------- 4. Добавляем внутренние связи сабграфов, не затронутые перенаправлением ----------
    for (const [, { sub }] of subgraphByNodeId.entries()) {
        if (!sub.links) continue;
        for (const rawLink of sub.links) {
            const link = Array.isArray(rawLink)
                ? { id: rawLink[0], origin_id: rawLink[1], origin_slot: rawLink[2], target_id: rawLink[3], target_slot: rawLink[4], type: rawLink[5] }
                : { ...rawLink };

            // Пропускаем связи, которые уже были заменены внешними
            if (linkIdRemap.has(link.id)) continue;

            // Заменяем id узлов, если они переехали
            if (idMap.has(String(link.origin_id))) link.origin_id = idMap.get(String(link.origin_id));
            if (idMap.has(String(link.target_id))) link.target_id = idMap.get(String(link.target_id));

            // Пропускаем всё ещё фиктивные связи
            if (link.origin_id === -10 || link.target_id === -20) continue;

            allLinks.push(link);
        }
    }

    // ---------- 5. Удаляем связи с -10/-20 (на всякий случай, если что-то проскользнуло) ----------
    const filteredLinks = allLinks//.filter(link => link.origin_id !== -10 && link.target_id !== -20);

    // ---------- 6. Обновляем ссылки в inputs/outputs нод ----------
    for (const node of allNodes) {
        if (node.outputs) {
            for (const output of node.outputs) {
                if (Array.isArray(output.links)) {
                    output.links = output.links.map(lid => linkIdRemap.get(lid) ?? lid);
                }
            }
        }
        if (node.inputs) {
            for (const input of node.inputs) {
                if (input.link != null && linkIdRemap.has(input.link)) {
                    input.link = linkIdRemap.get(input.link);
                }
            }
        }
    }

    // ---------- 7. Строим карты графа ----------
    const nodesById = new Map(allNodes.map(n => [n.id, n]));
    const incomingByNodeId = new Map();
    const outgoingByNodeId = new Map();

    function addEdge(edge) {
        if (!outgoingByNodeId.has(edge.originNodeId)) outgoingByNodeId.set(edge.originNodeId, []);
        if (!incomingByNodeId.has(edge.targetNodeId)) incomingByNodeId.set(edge.targetNodeId, []);
        outgoingByNodeId.get(edge.originNodeId).push(edge);
        incomingByNodeId.get(edge.targetNodeId).push(edge);
    }

    for (const link of filteredLinks) {
        const originNode = nodesById.get(link.origin_id);
        const targetNode = nodesById.get(link.target_id);

        const edge = {
            originNodeId: link.origin_id,
            targetNodeId: link.target_id,
            linktype: link.type,
            sourceOutputName: normalizeText(originNode?.outputs?.[link.origin_slot]?.name),
            targetInputName: normalizeText(targetNode?.inputs?.[link.target_slot]?.name),
            originType: normalizeText(originNode?.type),
            targetType: normalizeText(targetNode?.type),
            dataType: null,
        };
        addEdge(edge);
    }

    return {
        nodes: allNodes,
        nodesById,
        normalLinks: filteredLinks,     // массив объектов связей
        incomingByNodeId,
        outgoingByNodeId,
    };
}
function asumePrompt(widgetValue) {
    // Возвращаем объект с нулями, если это не строка
    if (typeof widgetValue !== 'string') return { pos: 0, neg: 0 };

    const text = widgetValue.toLowerCase();

    // Базовый скор (то, что присуще ЛЮБОМУ промпту: длина, запятые, веса)
    let baseScore = 0;
    let posScore = 0;
    let negScore = 0;

    // 1. Базовые проверки синтаксиса
    if (text.length > 15) baseScore += 1;
    if (text.length > 50) baseScore += 1;

    // Синтаксис весов (бывает и там, и там, но это точно промпт)
    if (/\([\w\s,.-]+:\d*\.?\d+\)/.test(text)) baseScore += 2;
    if (/\[[\w\s,.-]+\]/.test(text)) baseScore += 1;
    if (/\([\w\s,.-]+\)/.test(text)) baseScore += 1;

    // Запятые
    const commaCount = (text.match(/,/g) || []).length;
    if (commaCount >= 3) baseScore += 2;

    // 2. Индикаторы ПОЗИТИВНОГО промпта
    if (/<lora:[^:]+:\d*\.?\d+>/.test(text)) posScore += 3;

    const posMarkers = [
        'masterpiece', 'best quality', 'highres', 'painting',
        'realistic', '1girl', '1boy', '4k', '8k', 'raw photo', 'cinematic'
    ];
    for (const marker of posMarkers) {
        if (text.includes(marker)) posScore += 1;
    }

    // 3. Индикаторы НЕГАТИВНОГО промпта
    const negMarkers = [
        'worst quality', 'lowres', 'bad quality', 'low quality', 'normal quality',
        'bad anatomy', 'bad hands', 'missing fingers', 'extra digit', 'fewer digits',
        'mutated', 'deformed', 'ugly', 'poorly drawn',
        'cropped', 'watermark', 'signature', 'text', 'username', 'jpeg artifacts', 'blurry'
    ];
    for (const marker of negMarkers) {
        // Даем больший вес негативным маркерам, так как они очень специфичны
        if (text.includes(marker)) negScore += 2;
    }

    // Проверка на частые негативные эмбеддинги
    if (text.includes('easynegative') || text.includes('badhand')) negScore += 3;
    if (/embedding:.*(neg|bad).*/.test(text)) negScore += 2;

    // 4. Пенальти (если это JSON или путь к файлу)
    if (text.includes('{') && text.includes('}')) baseScore -= 5;
    if (/^[a-zA-Z0-9_/\\]+\.(safetensors|ckpt|pt|pth|bin)$/i.test(text)) baseScore -= 5;

    // 5. Итоговый подсчет
    // Прибавляем базовый скор (уверенность, что это вообще промпт) к полярностям
    return {
        pos: Math.max(0, baseScore + posScore),
        neg: Math.max(0, baseScore + negScore)
    };
}
function analyzeWidgets(node) {
    const hints = {
        hasModel: false,
        hasPositive: false,
        hasNegative: false,
        hasPrompt: false,
        hasGenParams: false,
        hasDimensions: false,
    };

    // Защита от нод без виджетов
    if (!node.widgets_values || !Array.isArray(node.widgets_values)) {
        return hints;
    }

    for (const value of node.widgets_values) {
        const positive = asumePrompt(value).pos;
        const negative = asumePrompt(value).neg;
        // --- 1. Проверка на модели ---
        if (typeof value === 'string' && /\.(safetensors|ckpt|pt|pth|sft)$/i.test(value)) {
            hints.hasModel = true;
        }

        // --- 2. Проверка на промпт ---
        if (positive >= 3 && positive > negative) {
            hints.hasPositive = true;
        }
        if (negative >= 3 && positive < negative) {
            hints.hasNegative = true;
        }
        if (positive >= 3 || negative >= 3) {
            hints.hasPrompt = true;
        }

        // --- 3. Проверка на параметры генерации (seed, cfg, steps) ---
        // Seed обычно очень большое число
        if (typeof value === 'number' && Number.isInteger(value) && value > 100000) {
            hints.hasGenParams = true; // Скорее всего это seed
        }
        // CFG обычно float от 1 до 30, Steps от 1 до 150
        // (определить их только по значению сложно, но можно проверять названия виджетов, если доступно node.widgets)

        // Поиск сэмплеров/скедулеров (строковые имена)
        if (typeof value === 'string') {
            const samplers = ['euler', 'euler_ancestral', 'dpmpp_2m', 'ddim', 'lms'];
            const schedulers = ['normal', 'karras', 'exponential', 'sgm_uniform'];
            if (samplers.includes(value.toLowerCase()) || schedulers.includes(value.toLowerCase())) {
                hints.hasGenParams = true;
            }
        }

        // --- 4. Проверка на габариты (Dimensions) ---
        // Стандартные разрешения или просто числа кратные 8 (обычно от 256 до 4096)
        if (typeof value === 'number' && Number.isInteger(value) && value >= 256 && value <= 4096 && value % 8 === 0) {
            // Чтобы не спутать с seed или шагами
            hints.hasDimensions = true;
        }
    }

    return hints;
}
function reaches(graphCtx, node, input, dataType, dataType2, maxDepth = 5) {
    const queue = [{
        nodeId: node.id,
        depth: 0
    }];

    const visited = new Set([node.id]);
    let head = 0;

    while (head < queue.length) {
        const currentNode = queue[head++];

        if (!currentNode || queue.depth >= maxDepth) continue;
        if (currentNode && currentNode.mode === 4) {
            const outgoing = graphCtx.outgoingByNodeId.get(currentNode.id).filter(t => t.linktype === dataType) || [];
            for (const edge of outgoing) {
                const targetNode = graphCtx.nodesById.get(edge.targetNodeId);
                if (targetNode && !visited.has(edge.targetNodeId)) {
                    visited.add(edge.targetNodeId);
                    queue.push({
                        nodeId: edge.targetNodeId,
                        depth: current.depth + 1,
                    });
                }
            }
            continue;
        }

        const outgoing = graphCtx.outgoingByNodeId.get(currentNode.nodeId).filter(t => t.targetType !== "" && t.linktype === dataType || t.linktype === dataType2) || [];

        for (const edge of outgoing) {
            // 🎯 нашли нужный input
            if (edge.targetInputName === input && edge.linktype === dataType) {
                return true;
            }

            if (!visited.has(edge.targetNodeId)) {
                visited.add(edge.targetNodeId);

                queue.push({
                    nodeId: edge.targetNodeId,
                    depth: currentNode.depth + 1
                });
            }
        }
    }

    return false;
}
function getDownstreamSignals(startNode, graphCtx, maxDepth = 4) {
    const dataType = "STRING";
    const dataType2 = "CONDITIONING";
    const queue = [{ nodeId: startNode.id, depth: 0, path: [startNode.id] }];
    const visited = new Set([startNode.id]);
    const signals = {
        reachesPositive: false,
        reachesNegative: false,
        reachesModel: false,
        reachesLatent: false,
        reachesSampler: false,
        positivePath: null,
        negativePath: null,
        modelPath: null,
        latentPath: null,
    };

    while (queue.length) {
        const current = queue.shift();
        if (!current || current.depth >= maxDepth) continue;

        const currentNode = graphCtx.nodesById.get(current.nodeId);

        // Если текущая нода bypassed – просто пробрасываем все её выходы, не анализируя сигналы
        if (currentNode && currentNode.mode === 4) {
            const outgoing = graphCtx.outgoingByNodeId.get(currentNode.id) || [];
            for (const edge of outgoing) {
                const targetNode = graphCtx.nodesById.get(edge.targetNodeId);
                if (targetNode && !visited.has(edge.targetNodeId)) {
                    visited.add(edge.targetNodeId);
                    queue.push({
                        nodeId: edge.targetNodeId,
                        depth: current.depth + 1,
                        path: [...current.path, edge.targetNodeId],
                    });
                }
            }
            continue;
        }

        const outgoing = (graphCtx.outgoingByNodeId.get(current.nodeId) ?? [])
            .filter(edge =>
                edge.targetType !== "" &&
                (edge.linktype === dataType || edge.linktype === dataType2)
            );
        for (const edge of outgoing) {
            const targetNode = graphCtx.nodesById.get(edge.targetNodeId);

            // Если целевая нода bypassed – сразу проходим сквозь неё
            if (targetNode && targetNode.mode === 4) {
                if (!visited.has(edge.targetNodeId)) {
                    visited.add(edge.targetNodeId);
                    const bypassedOutgoing = graphCtx.outgoingByNodeId.get(edge.targetNodeId) || [];
                    for (const bypassedEdge of bypassedOutgoing) {
                        if (!visited.has(bypassedEdge.targetNodeId)) {
                            visited.add(bypassedEdge.targetNodeId);
                            queue.push({
                                nodeId: bypassedEdge.targetNodeId,
                                depth: current.depth + 1,
                                path: [...current.path, edge.targetNodeId, bypassedEdge.targetNodeId],
                            });
                        }
                    }
                }
                continue; // не проверяем сигналы для bypassed
            }

            // Обычная проверка для активных нод
            if (edge.targetInputName === "positive" && edge.linktype === "CONDITIONING") {
                signals.reachesPositive = true;
                if (!signals.positivePath) signals.positivePath = [...current.path, edge.targetNodeId];
            }
            if (edge.targetInputName === "negative" && edge.linktype === "CONDITIONING") {
                signals.reachesNegative = true;
                if (!signals.negativePath) signals.negativePath = [...current.path, edge.targetNodeId];
            }
            if (edge.targetInputName === "model" || edge.linktype === "MODEL") {
                signals.reachesModel = true;
                if (!signals.modelPath) signals.modelPath = [...current.path, edge.targetNodeId];
            }
            if (edge.targetInputName === "latent_image" && edge.linktype === "LATENT") {
                signals.reachesLatent = true;
                if (!signals.latentPath) signals.latentPath = [...current.path, edge.targetNodeId];
            }
            if (
                (edge.targetType || "").includes("sampler") &&
                edge.linktype === "COMBO" ||
                edge.linktype === "FLOAT" ||
                edge.linktype === "INT"
                ) {
                signals.reachesSampler = true;
            }

            if (!visited.has(edge.targetNodeId)) {
                visited.add(edge.targetNodeId);
                queue.push({
                    nodeId: edge.targetNodeId,
                    depth: current.depth + 1,
                    path: [...current.path, edge.targetNodeId],
                });
            }
        }
    }
    return signals;
}
function getStrictMatches(targetNode, activeNodes) {
    const nodes = activeNodes || [];
    const exactMatches = nodes.filter(
        (candidate) => candidate.id === targetNode.id && candidate.type === targetNode.type
    );
    if (exactMatches.length > 0) {
        return exactMatches;
    }
    return nodes.filter((candidate) => candidate.type === targetNode.type);
}
function extract(node, ...keys) {
    const walk = (value, depth) => {
        if (value == null) return [];

        if (Array.isArray(value)) {
            return value.flatMap(v => walk(v, depth));
        }

        if (value instanceof Map) {
            const key = keys[depth];

            if (key !== undefined) {
                return walk(value.get(key), depth + 1);
            }

            return [...value.values()].flatMap(v => walk(v, depth));
        }

        if (typeof value === 'object') {
            const key = keys[depth];
            if (key === undefined) return [value];
            return walk(value[key], depth + 1);
        }

        return [value];
    };

    return walk(node, 0);
}
function getNodeRole(node, graphCtx, options = {}) {
    const {
        allowEmptyWidgets = false,
    } = options;
    const type = normalizeText(node.type);
    const title = normalizeText(node.title);
    const widgets = normalizeText(node.widgets_values) || [];
    const widgetValues = analyzeWidgets(node);
    const hasWidgetsStrings = node.widgets_values?.some(v => typeof v === "string" && v !== "");
    const hasOutLinks = node.outputs.some(o => o.links !== null && o.links.length);
    const nodeHasAnyKeyword = (keywords, ...fields) =>
        fields.some(v =>
            typeof v === "string" &&
            keywords.some(k => v.toLowerCase().includes(k))
        );
    const outStrings = node.outputs.flatMap(o =>
        [o.name, o.type, o.label].filter(v => typeof v === "string")
    );
    const hasPositiveP = nodeHasAnyKeyword(["positive"], title, type, ...outStrings);
    const hasNegativeP = nodeHasAnyKeyword(["negative"], title, type, ...outStrings);
    const hasPossibleP = nodeHasAnyKeyword(["prompt", "string", "text", "multiline"], type);
    const incoming = graphCtx.incomingByNodeId.get(node.id) || [];
    const outgoing = graphCtx.outgoingByNodeId.get(node.id) || [];
    //const downstream = getDownstreamSignals(node, graphCtx, 1);
    const outLinkNames = outgoing.map((edge) => normalizeText(edge.targetInputName));//.concat(incoming.map((edge) => edge.targetInputName));
    const outLinkTypes = outgoing.map((edge) => normalizeText(edge.linktype));
    const hasLinkInputName = (name) => outLinkNames.includes(name);
    const hasWidget = (content) => JSON.stringify(node.widgets_values).toLowerCase().includes(content);
    const isLinkType = (type) => outLinkTypes.includes(type);
    const widgetsContain = (widget) => widgets.includes((widget));
    if (type.includes("latent") || title.includes("latent") || hasLinkInputName("latent") && isLinkType("latent")) {
        return "latent_source";
    }
    if (widgetsContain(".safetensors") &&
        type.includes("model") ||
        type.includes("checkpoin")
    ) {
        return "model_provider";
    }
    if (
        type.includes("lora") &&
        hasWidget("lora")
    ) {
        return "lora_provider";
    }
    if (
        (
            widgetValues.hasPositive ||
            (
                nodeHasAnyKeyword(["positive"], title, type, ...outStrings) &&
                (
                    allowEmptyWidgets ||
                    hasWidgetsStrings
                )
            )
        ) &&
        hasOutLinks
    ) {
        return "prompt_positive";
    }
    if (
        (
            widgetValues.hasNegative ||
            (
                nodeHasAnyKeyword(["negative"], title, type, ...outStrings) &&
                (
                    allowEmptyWidgets ||
                    hasWidgetsStrings
                )
            )
        ) &&
        hasOutLinks
    ) {
        return "prompt_negative";
    }
    if (
        (
            widgetValues.hasPrompt ||
            nodeHasAnyKeyword(["prompt", "string", "text", "multiline"], type) &&
            allowEmptyWidgets
        ) &&
        hasOutLinks
    ) {
        return "prompt_possible";
    }
    if (type.includes("sampler")) {
        return "sampler_params";
    }

    return "unknown";
}
function getRoleMatches(targetNode, activeNodes, graphCtx) {
    const targetRole = getNodeRole(targetNode, graphCtx, { allowEmptyWidgets: true });

    // Если роль не определена, вернуть пустой массив
    if (!targetRole || targetRole === "unknown") {
        return [];
    }

    // Базовое условие: роль кандидата должна совпадать
    const candidateNodes = (activeNodes || []).filter(candidate => {
        const candidateRole = getNodeRole(candidate, graphCtx);
        if (candidateRole === targetRole) {
            return true;
        }
        // Для положительного/отрицательного промпта также принимаем possible
        if (
            (targetRole === "prompt_positive" || targetRole === "prompt_negative") &&
            candidateRole === "prompt_possible"
        ) {
            return true;
        }
        return false;
    });

    return candidateNodes;
}
function test(node, filePath) {
    const extractData = extractComfyWorkflow(filePath);
    const graphCtx = buildGraphContext(extractData.workflow);
    const isActive = (n) => n.mode !== 4;
    const allactiveNodes = graphCtx === null || graphCtx === void 0 ? void 0 : graphCtx?.nodes.filter(isActive);
    const role = getNodeRole(node, graphCtx, { allowEmptyWidgets: false});
    const downstream = getDownstreamSignals(node, graphCtx, 5);
    const nodetype = graphCtx.nodesById.get(node.id).type;
    const StrictMatches = getStrictMatches(node, allactiveNodes)
    const roleMatches = getRoleMatches(node, allactiveNodes, graphCtx);
    const widgetsValues = analyzeWidgets(node);
    const promptConfidence = asumePrompt(node.widgets_values[0]);
    const promptCandidates = graphCtx.nodes.filter(o => Array.isArray(o.widgets_values) ? o.widgets_values.some(v => asumePrompt(v) >= 3) : false);
    //const test = graphCtx.nodes.filter(o => asumePrompt(o.widgets_values[o]) >= 3);

    return console.log(role);
}
const targetNode = 1630;
const image = "C:/AI Stability Matrix/Data/Images/Text2Img/ComfyUI_00221_.png";
const wholeWorkflow = extractComfyWorkflow(image);
const wholeWorkflowCtx = buildGraphContext(wholeWorkflow.workflow);
const wholeNode = wholeWorkflowCtx.nodesById.get(targetNode);
test(wholeNode, image);

const input = process.argv[2];

if (!input) {
    console.log("Использование:");
    console.log("node ExtractWorkflow.js image.png");
    process.exit(0);
}

const filePath = path.resolve(input);
extractComfyWorkflow(filePath);
