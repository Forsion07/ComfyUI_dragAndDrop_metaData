// ====== Majoor media path picker (adapted) ======
const _REJECT_TYPES = new Set([
    "number",
    "int",
    "float",
    "boolean",
    "toggle",
    "checkbox"
]);

const _OUTPUTY_TERMS = [
    "output",
    "save",
    "export",
    "folder",
    "dir"
];

const _PATH_TERMS = [
    "file",
    "path"
];

const _PATH_HINT_TERMS = [
    "path",
    "file",
    "input",
    "src",
    "source"
];

function looksLikeImagePath(v, ext) {
    return typeof v === "string" &&
        /\.(png|jpg|jpeg|webp|bmp|gif)$/i.test(v);
}

function looksLikeVideoPath(v, ext) {
    return typeof v === "string" &&
        /\.(mp4|webm|mov|avi|mkv)$/i.test(v);
}

function looksLikeAudioPath(v, ext) {
    return typeof v === "string" &&
        /\.(wav|mp3|ogg|flac)$/i.test(v);
}

function looksLikeModel3DPath(v, ext) {
    return typeof v === "string" &&
        /\.(obj|glb|gltf|ply|stl)$/i.test(v);
}

function comboHasValue(widget, exts) {
    const vals =
        widget?.options?.values;
    if (!Array.isArray(vals))
        return false;
    return vals.some(v => {
        const s =
            typeof v === "string"
                ? v
                : (v?.content ??
                    v?.value ??
                    v?.text ??
                    "");
        return exts.some(
            ext =>
                String(s)
                    .toLowerCase()
                    .endsWith("." + ext)
        );
    });
}

const comboHasAnyImageValue =
    w => comboHasValue(
        w,
        ["png", "jpg", "jpeg", "webp", "bmp", "gif"]
    );

const comboHasAnyVideoValue =
    w => comboHasValue(
        w,
        ["mp4", "webm", "mov", "avi", "mkv"]
    );

const comboHasAnyAudioValue =
    w => comboHasValue(
        w,
        ["wav", "mp3", "ogg", "flac"]
    );

const comboHasAnyModel3DValue =
    w => comboHasValue(
        w,
        ["obj", "glb", "gltf", "ply", "stl"]
    );

function _pickBestPathWidget(node, droppedExt, cfg) {
    const widgets =
        node?.widgets;
    if (!widgets?.length)
        return null;
    const ext = String(droppedExt || "").toLowerCase().replace(/^\./, "");
    const nodeType = String(node?.type || "").toLowerCase();
    const isKnownNode = cfg.knownNodeIncludes.some(p => nodeType.includes(p));
    const candidates = [];
    for (const w of widgets) {
        const type = String(w?.type || "").toLowerCase();
        const value = w?.value;
        if (_REJECT_TYPES.has(type)) continue;
        if (typeof value === "number") continue;
        const stringLike =
            type === "text" ||
            type === "string" ||
            type === "combo";
        if (!stringLike) continue;
        const name = String(w?.name || w?.label || "").toLowerCase().trim();
        let score = 0;
        if (cfg.exactNames.has(name)) score += 100;
        if (
            name === "file" &&
            isKnownNode &&
            type === "combo" &&
            cfg.comboChecker(w)
        ) score += 100;
        if (cfg.mediaTerms.some(t => name.includes(t))
        ) score += 80;
        if (_PATH_TERMS.some(t => name.includes(t))
        ) score += 35;
        if (_OUTPUTY_TERMS.some(t => name.includes(t))
        ) score -= 90;
        if (cfg.exactSingleNames.has(name)) {
            if (typeof value === "string" && value.trim() === "") {
                score += 25;
            } else if (cfg.looksLikeFn(value, ext)) {
                score += 25;
            }
        }
        if (isKnownNode) score += 15;
        candidates.push({ widget: w, score });
    }
    candidates.sort((a, b) =>
        b.score - a.score
    );
    return (candidates[0]?.score >= 20)
        ? candidates[0].widget
        : null;
}

const _IMAGE_CFG = {
    exactNames:
        new Set([
            "image",
            "image_path",
            "input_image",
            "source_image"
        ]),
    knownNodeIncludes: [
        "loadimage",
        "loadimagemask",
        "imageloader"
    ],
    mediaTerms: [
        "image",
        "img",
        "mask",
        "photo",
        "picture"
    ],
    exactSingleNames: new Set(["image"]),
    looksLikeFn: looksLikeImagePath,
    comboChecker: comboHasAnyImageValue,
};

const _VIDEO_CFG = {
    exactNames:
        new Set([
            "video",
            "video_path"
        ]),
    knownNodeIncludes: [
        "loadvideo",
        "videoloader"
    ],
    mediaTerms: ["video"],
    exactSingleNames: new Set(["video"]),
    looksLikeFn: looksLikeVideoPath,
    comboChecker: comboHasAnyVideoValue,
};

const _AUDIO_CFG = {
    exactNames:
        new Set([
            "audio",
            "audio_path"
        ]),
    knownNodeIncludes: ["loadaudio"],
    mediaTerms: ["audio"],
    exactSingleNames: new Set(["audio"]),
    looksLikeFn: looksLikeAudioPath,
    comboChecker: comboHasAnyAudioValue,
};

const _MODEL3D_CFG = {
    exactNames:
        new Set([
            "model",
            "mesh",
            "model_path"
        ]),
    knownNodeIncludes: [
        "load3d",
        "loadmodel"
    ],
    mediaTerms: [
        "model",
        "mesh",
        "geometry"
    ],
    exactSingleNames:
        new Set([
            "model",
            "mesh"
        ]),
    looksLikeFn: looksLikeModel3DPath,
    comboChecker: comboHasAnyModel3DValue,
};

export function pickBestMediaPathWidget(node, payload, droppedExt) {
    const kind = String(payload?.kind || "").toLowerCase();
    const cfg =
        kind === "image"
            ? _IMAGE_CFG
            : kind === "audio"
                ? _AUDIO_CFG
                : kind === "model3d"
                    ? _MODEL3D_CFG
                    : _VIDEO_CFG;
    return _pickBestPathWidget(
        node,
        droppedExt,
        cfg
    );
}