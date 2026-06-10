import {
    comboHasAnyAudioValue,
    comboHasAnyImageValue,
    comboHasAnyModel3DValue,
    comboHasAnyVideoValue,
    looksLikeAudioPath,
    looksLikeImagePath,
    looksLikeModel3DPath,
    looksLikeVideoPath,
} from "./video.js";
// ====== Majoor media path picker (adapted) ======
// Widget types that can never hold a file path
const _REJECT_TYPES = new Set(["number", "int", "float", "boolean", "toggle", "checkbox"]);
// Terms that indicate an output/save widget (strong negative signal)
const _OUTPUTY_TERMS = ["output", "save", "export", "folder", "dir"];
// Generic path-like widget name terms
const _PATH_TERMS = ["file", "path"];
// Terms that suggest a file-path input
const _PATH_HINT_TERMS = ["path", "file", "input", "src", "source"];

const _pickBestPathWidget = (node, droppedExt, cfg) => {
    const widgets = node?.widgets;
    if (!Array.isArray(widgets) || !widgets.length) return null;

    const ext = String(droppedExt || "")
        .toLowerCase()
        .replace(/^\./, "");
    const nodeType = String(node?.type || "").toLowerCase();
    const isKnownNode = cfg.knownNodeIncludes.some((p) => nodeType.includes(p));

    const candidates = [];
    for (const w of widgets) {
        if (!w) continue;
        const type = String(w?.type || "").toLowerCase();
        const value = w?.value;

        if (_REJECT_TYPES.has(type)) continue;
        if (typeof value === "number" || typeof value === "boolean") continue;

        const stringLikeByType = type === "text" || type === "string" || type === "combo";
        const stringLikeByCallback = typeof w?.callback === "function" && typeof value === "string";
        if (!stringLikeByType /* && !stringLikeByCallback */) continue;

        const name = String(w?.name || w?.label || "")
            .toLowerCase()
            .trim();

        let score = 0;
        if (cfg.exactNames.has(name)) score += 100;

        if (name === "file" && isKnownNode && type === "combo" && cfg.comboChecker(w, ext)) {
            score += 100;
        }

        const hasMediaHint = cfg.mediaTerms.some((t) => name.includes(t));
        const hasPathHint = _PATH_HINT_TERMS.some((t) => name.includes(t));
        if (hasMediaHint && hasPathHint) score += 80;
        if (_PATH_TERMS.some((t) => name.includes(t))) score += 35;

        for (const { terms, score: pts } of cfg.extraTerms) {
            if (terms.some((t) => name.includes(t))) score += pts;
        }

        if (_OUTPUTY_TERMS.some((t) => name.includes(t))) score -= 90;

        if (cfg.exactSingleNames.has(name)) {
            const empty = typeof value === "string" && value.trim() === "";
            if (empty) score += 25;
            else if (cfg.looksLikeFn(value, ext)) score += 25;
            else score -= 10;
        }

        if (isKnownNode) score += 15;
        const emptyValue = typeof value === "string" && value.trim() === "";
        if (emptyValue) score += 3;
        if (type === "combo" && cfg.comboChecker(w, ext)) score += 12;

        candidates.push({ w, score, emptyValue, combo: type === "combo" });
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.emptyValue !== a.emptyValue) return b.emptyValue ? 1 : -1;
        if (b.combo !== a.combo) return b.combo ? 1 : -1;
        return 0;
    });

    const best = candidates[0];
    if (!best || best.score < 20) return null;
    try {
        best.w[cfg.scoreKey] = best.score;
    } catch (e) {
        console.debug?.(e);
    }
    return best.w;
};

const _VIDEO_CFG = {
    exactNames: new Set([
        "video_path", "input_video", "source_video", "video", "driven_video", "footage",
        "input_path", "directory", "folder_path", "folder", "path", "video_directory"
    ]),
    knownNodeIncludes: [
        "loadvideo", "vhs_loadvideo", "videoloader", "sadtalker", "wav2lip", "reactor",
        "multiimageloader", "ltxdirector", "ltxsequencer", "ltxkeyframer"
    ],
    mediaTerms: ["video", "footage", "clip", "movie"],
    extraTerms: [{ terms: ["media", "clip", "footage", "drive"], score: 45 }],
    exactSingleNames: new Set(["video"]),
    looksLikeFn: looksLikeVideoPath,
    comboChecker: comboHasAnyVideoValue,
    scoreKey: "__mjrVideoPickScore",
};

const _IMAGE_CFG = {
    exactNames: new Set([
        "image", "image_path", "input_image", "source_image", "ref_image", "pose_image",
        "hint_image", "target_image", "ipadapter_image", "input_path", "directory",
        "folder_path", "folder", "path", "image_directory"
    ]),
    knownNodeIncludes: [
        "loadimage", "loadimagemask", "imageloader", "reactor", "roop", "ipadapter",
        "controlnet", "instantid", "pulid", "multiimageloader", "ltxdirector",
        "ltxsequencer", "ltxkeyframer"
    ],
    mediaTerms: ["image", "img", "mask", "frame", "photo", "picture", "face", "ipadapter"],
    extraTerms: [{ terms: ["media", "source", "first", "last", "target", "reference"], score: 35 }],
    exactSingleNames: new Set(["image", "face"]),
    looksLikeFn: looksLikeImagePath,
    comboChecker: comboHasAnyImageValue,
    scoreKey: "__mjrImagePickScore",
};

const _AUDIO_CFG = {
    exactNames: new Set([
        "audio_path", "input_audio", "source_audio", "audio", "driven_audio", "voice",
        "bgm", "soundtrack", "input_path", "directory", "folder_path", "folder",
        "path", "audio_directory"
    ]),
    knownNodeIncludes: [
        "loadaudio",
        "vhs_loadaudioupload",
        "vhs_loadaudio",
        "audioloader",
        "inputaudio",
        "sadtalker",
        "wav2lip",
        "multiimageloader",
        "ltxdirector",
        "ltxsequencer",
        "ltxkeyframer"
    ],
    mediaTerms: ["audio", "sound", "music", "voice", "speech", "wav", "mp3"],
    extraTerms: [{ terms: ["media", "track", "drive"], score: 45 }],
    exactSingleNames: new Set(["audio", "voice"]),
    looksLikeFn: looksLikeAudioPath,
    comboChecker: comboHasAnyAudioValue,
    scoreKey: "__mjrAudioPickScore",
};

const _MODEL3D_CFG = {
    exactNames: new Set([
        "model_path",
        "input_model",
        "source_model",
        "mesh_path",
        "input_mesh",
        "geometry_path",
        "scene_path",
        "point_cloud_path",
        "splat_path",
        "model",
        "mesh",
        "geometry",
        "input_path",
        "directory",
        "folder_path",
        "folder",
        "path",
        "model_directory"
    ]),
    knownNodeIncludes: [
        "load3d",
        "loadmodel",
        "loadmesh",
        "loadobj",
        "loadgltf",
        "loadglb",
        "loadstl",
        "loadply",
        "pointcloud",
        "meshloader",
        "modelloader",
        "tripo3d",
        "unique3d",
        "multiimageloader",
        "ltxdirector",
        "ltxsequencer",
        "ltxkeyframer"
    ],
    mediaTerms: ["model", "mesh", "geometry", "scene", "object", "point", "cloud", "splat"],
    extraTerms: [{ terms: ["asset", "resource"], score: 30 }],
    exactSingleNames: new Set(["model", "mesh", "geometry"]),
    looksLikeFn: looksLikeModel3DPath,
    comboChecker: comboHasAnyModel3DValue,
    scoreKey: "__mjrModel3DPickScore",
};

export const pickBestMediaPathWidget = (node, payload, droppedExt) => {
    const kind = String(payload?.kind || "").toLowerCase();
    const cfg =
        kind === "model3d"
            ? _MODEL3D_CFG
            : kind === "audio"
                ? _AUDIO_CFG
                : kind === "image"
                    ? _IMAGE_CFG
                    : _VIDEO_CFG;
    return _pickBestPathWidget(node, droppedExt, cfg);
};

export const getInputSlotUnderClientXY = (app, node, clientX, clientY) => {
    if (!node || !node.inputs || !node.inputs.length) return null;
    const canvasEl = app?.canvas?.canvas || document.querySelector("canvas");
    const ds = app?.canvas?.ds;
    if (!canvasEl || !ds) return null;

    const rect = canvasEl.getBoundingClientRect();
    const scale = Number(ds.scale) || 1;
    const off = ds.offset || [0, 0];
    const offX = Array.isArray(off) ? Number(off[0]) || 0 : Number(off?.x) || 0;
    const offY = Array.isArray(off) ? Number(off[1]) || 0 : Number(off?.y) || 0;

    const x = (clientX - rect.left) / scale - offX;
    const y = (clientY - rect.top) / scale - offY;

    const nodeX = node.pos[0];
    const nodeY = node.pos[1];

    const titleHeight = node.constructor.title_height || 30;
    const slotHeight = 20;

    for (let i = 0; i < node.inputs.length; i++) {
        const input = node.inputs[i];
        const slotY = nodeY + titleHeight + i * slotHeight + slotHeight / 2;

        const dx = x - nodeX;
        const dy = y - slotY;

        if (Math.abs(dx) <= 18 && Math.abs(dy) <= 12) {
            return { index: i, input };
        }
    }
    return null;
};

async function fetchWorkflowAndPrompt(payload) {
    const viewUrl = `/api/view?filename=${encodeURIComponent(payload.filename)}&type=${encodeURIComponent(payload.type)}&subfolder=${encodeURIComponent(payload.subfolder || "")}`;
    const response = await fetch(viewUrl);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return extractMetaDataFromBuffer(buffer);
}