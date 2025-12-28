// ===== STATE MANAGEMENT =====
const state = {
    videoFile: null,
    videoDuration: 0,
    chunks: [],
    currentSelection: { start: 0, end: 60 },
    isDraggingStart: false,
    isDraggingEnd: false,
    isDraggingPlayhead: false,
    previewingChunk: false,
    selectedChunkId: null,
    ffmpegLoaded: false,
    ffmpegLoading: false,
    ffmpeg: null,
    fetchFile: null,
};

// ===== DOM ELEMENTS =====
const elements = {
    uploadArea: document.getElementById('uploadArea'),
    fileInput: document.getElementById('fileInput'),
    videoPlayer: document.getElementById('videoPlayer'),
    timeline: document.getElementById('timeline'),
    selectionStart: document.getElementById('selectionStart'),
    selectionEnd: document.getElementById('selectionEnd'),
    selectionHighlight: document.getElementById('selectionHighlight'),
    playhead: document.getElementById('playhead'),
    previewSection: document.getElementById('previewSection'),
    timelineSection: document.getElementById('timelineSection'),
    chunksSection: document.getElementById('chunksSection'),
    chunksContainer: document.getElementById('chunksContainer'),
    emptyState: document.getElementById('emptyState'),
    startTimeInput: document.getElementById('startTimeInput'),
    endTimeInput: document.getElementById('endTimeInput'),
    alertContainer: document.getElementById('alertContainer'),
    totalDuration: document.getElementById('totalDuration'),
    resolution: document.getElementById('resolution'),
    fileSize: document.getElementById('fileSize'),
    chunkCount: document.getElementById('chunkCount'),
    selectionDuration: document.getElementById('selectionDuration'),
    validIndicator: document.getElementById('validIndicator'),
};

// ===== UTILITY FUNCTIONS =====
function formatTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
function parseTime(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(p => parseInt(p, 10) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
}
function formatBytes(bytes) {
    if (!bytes) return '-';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
function showAlert(message, type = 'info') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    elements.alertContainer.appendChild(alert);
    setTimeout(() => alert.remove(), 4000);
}

// ===== FFmpeg (load on demand) =====
async function ensureFFmpegLoaded() {
    if (state.ffmpegLoaded) return;
    if (state.ffmpegLoading) {
        return new Promise((res) => {
            const check = () => {
                if (state.ffmpegLoaded) return res();
                setTimeout(check, 200);
            };
            check();
        });
    }

    state.ffmpegLoading = true;
    showAlert('Loading ffmpeg (for MP4 conversion) — may take a few seconds...', 'info');

    // load ffmpeg script
    await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed to load ffmpeg script'));
        document.head.appendChild(s);
    });

    try {
        // create FFmpeg with explicit corePath to ensure wasm core loads
        const { createFFmpeg, fetchFile } = FFmpeg;
        const ff = createFFmpeg({
            log: true,
            corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
        });
        await ff.load();
        state.ffmpeg = ff;
        state.fetchFile = fetchFile;
        state.ffmpegLoaded = true;
        console.log('ffmpeg loaded');
        showAlert('ffmpeg loaded', 'success');
    } catch (err) {
        console.error('ffmpeg load error', err);
        showAlert('Failed to initialize ffmpeg — MP4 conversion will not be available', 'warning');
    } finally {
        state.ffmpegLoading = false;
    }
}

// ===== FILE HANDLING =====
function handleFileSelect(file) {
    if (!file.type.startsWith('video/')) {
        showAlert('Please select a valid video file', 'error');
        return;
    }
    state.videoFile = file;
    const videoURL = URL.createObjectURL(file);
    elements.videoPlayer.src = videoURL;
    elements.videoPlayer.onloadedmetadata = () => {
        state.videoDuration = elements.videoPlayer.duration || 0;
        state.currentSelection = { start: 0, end: Math.min(60, state.videoDuration) };
        state.selectedChunkId = null;
        updateUI();
        generateTimelineFrames();
        showAlert(`Video loaded: ${file.name}`, 'success');
    };
}

function generateTimelineFrames() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const frameCount = 10;
    const timelineWidth = elements.timeline.offsetWidth || 600;
    const frameWidth = Math.max(40, Math.floor(timelineWidth / frameCount));
    canvas.height = 60;
    canvas.width = frameWidth;
    elements.timeline.innerHTML = '';
    for (let i = 0; i < frameCount; i++) {
        const frameDiv = document.createElement('div');
        frameDiv.className = 'timeline-frame';
        frameDiv.style.width = frameWidth + 'px';
        frameDiv.style.left = (frameWidth * i) + 'px';
        elements.timeline.appendChild(frameDiv);
        const time = (state.videoDuration / Math.max(1, frameCount)) * i;
        (function (div, t) {
            const capture = () => {
                const old = elements.videoPlayer.currentTime;
                const onseek = () => {
                    try {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(elements.videoPlayer, 0, 0, canvas.width, canvas.height);
                        div.style.backgroundImage = `url(${canvas.toDataURL()})`;
                    } catch (err) { }
                    elements.videoPlayer.removeEventListener('seeked', onseek);
                    try { elements.videoPlayer.currentTime = old; } catch (e) { }
                };
                elements.videoPlayer.addEventListener('seeked', onseek);
                try { elements.videoPlayer.currentTime = Math.min(t, state.videoDuration - 0.01); } catch (e) { elements.videoPlayer.removeEventListener('seeked', onseek); }
            };
            setTimeout(capture, i * 80);
        })(frameDiv, time);
    }
    setTimeout(() => {
        const overlayHTML = `
            <div class="selection-highlight" id="selectionHighlight"></div>
            <div class="selection-start" id="selectionStart"></div>
            <div class="playhead" id="playhead"></div>
            <div class="selection-end" id="selectionEnd"></div>
        `;
        elements.timeline.insertAdjacentHTML('beforeend', overlayHTML);
        elements.selectionStart = document.getElementById('selectionStart');
        elements.selectionEnd = document.getElementById('selectionEnd');
        elements.selectionHighlight = document.getElementById('selectionHighlight');
        elements.playhead = document.getElementById('playhead');
        attachTimelineHandlers();
        updateTimelineDisplay();
    }, frameCount * 80 + 150);
}

function updateUI() {
    if (state.videoFile) {
        elements.previewSection.style.display = 'block';
        elements.timelineSection.style.display = 'block';
        elements.emptyState.style.display = 'none';
        elements.totalDuration.textContent = formatTime(state.videoDuration);
        elements.fileSize.textContent = formatBytes(state.videoFile.size);
        const video = elements.videoPlayer;
        if (video.videoWidth && video.videoHeight) {
            elements.resolution.textContent = `${video.videoWidth}x${video.videoHeight}`;
        }
        updateChunkCount();
    } else {
        elements.previewSection.style.display = 'none';
        elements.timelineSection.style.display = 'none';
        elements.chunksSection.style.display = 'none';
        elements.emptyState.style.display = 'block';
        elements.chunksContainer.innerHTML = '';
        state.chunks = [];
    }
}

// ===== TIMELINE HANDLING =====
function getTimelinePosition(clientX) {
    const rect = elements.timeline.getBoundingClientRect();
    const x = clientX - rect.left;
    const timelineWidth = Math.max(1, rect.width);
    const clampedX = Math.max(0, Math.min(timelineWidth, x));
    const percentage = clampedX / timelineWidth;
    return percentage * state.videoDuration;
}

function attachTimelineHandlers() {
    if (!elements.selectionStart || !elements.selectionEnd || !elements.playhead || !elements.timeline) return;
    [elements.selectionStart, elements.selectionEnd, elements.playhead].forEach(el => {
        el.addEventListener('mousedown', (e) => e.preventDefault());
        el.addEventListener('touchstart', (e) => e.preventDefault());
    });
    elements.selectionStart.onmousedown = (e) => { state.isDraggingStart = true; };
    elements.selectionStart.ontouchstart = (e) => { state.isDraggingStart = true; };
    elements.selectionEnd.onmousedown = (e) => { state.isDraggingEnd = true; };
    elements.selectionEnd.ontouchstart = (e) => { state.isDraggingEnd = true; };
    elements.playhead.onmousedown = (e) => { state.isDraggingPlayhead = true; };
    elements.playhead.ontouchstart = (e) => { state.isDraggingPlayhead = true; };
    elements.timeline.onclick = (e) => {
        const time = getTimelinePosition(e.clientX || (e.touches && e.touches[0].clientX));
        elements.videoPlayer.currentTime = time;
        updateTimelineDisplay();
    };
}

function updateTimelineDisplay() {
    const timelineWidth = elements.timeline.offsetWidth || 600;
    const pixelsPerSecond = state.videoDuration > 0 ? timelineWidth / state.videoDuration : 0;
    const start = Math.max(0, Math.min(state.currentSelection.start, state.videoDuration));
    const end = Math.max(0, Math.min(state.currentSelection.end, state.videoDuration));
    const startPx = start * pixelsPerSecond;
    const endPx = end * pixelsPerSecond;
    if (elements.selectionStart) elements.selectionStart.style.left = startPx + 'px';
    if (elements.selectionEnd) elements.selectionEnd.style.left = endPx + 'px';
    if (elements.selectionHighlight) {
        const leftPercent = state.videoDuration ? (start / state.videoDuration) * 100 : 0;
        const widthPercent = state.videoDuration ? ((end - start) / state.videoDuration) * 100 : 0;
        elements.selectionHighlight.style.left = leftPercent + '%';
        elements.selectionHighlight.style.width = widthPercent + '%';
    }
    if (elements.playhead) {
        const playheadPx = elements.videoPlayer.currentTime * pixelsPerSecond;
        elements.playhead.style.left = Math.max(0, Math.min(timelineWidth, playheadPx)) + 'px';
    }
    elements.startTimeInput.value = formatTime(start);
    elements.endTimeInput.value = formatTime(end);
    const duration = Math.max(0, end - start);
    elements.selectionDuration.textContent = formatTime(duration);
    const isValid = duration > 0 && duration <= 90;
    elements.validIndicator.textContent = isValid ? '✅' : '❌';
}

// ===== CHUNK MANAGEMENT =====
function addChunk() {
    const duration = state.currentSelection.end - state.currentSelection.start;
    if (duration <= 0 || duration > 90) {
        showAlert('Selection must be between 1 and 90 seconds', 'warning');
        return;
    }
    const chunk = {
        id: Date.now() + Math.random(),
        start: state.currentSelection.start,
        end: state.currentSelection.end,
        duration: duration,
    };
    state.chunks.push(chunk);
    // keep selection on new chunk but set it as selected
    state.selectedChunkId = chunk.id;
    updateChunkCount();
    renderChunks();
    showAlert(`Chunk added: ${formatTime(chunk.start)} - ${formatTime(chunk.end)}`, 'success');
}

function deleteChunk(id) {
    state.chunks = state.chunks.filter(c => c.id !== id);
    if (state.selectedChunkId === id) state.selectedChunkId = null;
    updateChunkCount();
    renderChunks();
    showAlert('Chunk removed', 'info');
}

function updateChunkCount() {
    elements.chunkCount.textContent = state.chunks.length;
    if (state.chunks.length > 0) {
        elements.chunksSection.style.display = 'block';
    } else {
        elements.chunksSection.style.display = 'none';
    }
}

function autoSplitChunks() {
    state.chunks = [];
    const chunkDuration = 60;
    let currentStart = 0;
    while (currentStart < state.videoDuration - 0.01) {
        const chunkEnd = Math.min(currentStart + chunkDuration, state.videoDuration);
        state.chunks.push({
            id: Date.now() + Math.random(),
            start: currentStart,
            end: chunkEnd,
            duration: chunkEnd - currentStart,
        });
        currentStart = chunkEnd;
    }
    state.selectedChunkId = null;
    updateChunkCount();
    renderChunks();
    showAlert(`Auto-split: ${state.chunks.length} chunks created`, 'success');
}

function renderChunks() {
    elements.chunksContainer.innerHTML = '';
    state.chunks.forEach((chunk, index) => {
        const chunkDiv = document.createElement('div');
        chunkDiv.className = 'chunk-card';
        if (state.selectedChunkId === chunk.id) chunkDiv.classList.add('selected');
        chunkDiv.innerHTML = `
            <div class="chunk-preview">
                <span class="chunk-duration">${formatTime(chunk.duration)}</span>
            </div>
            <div class="chunk-info">
                <div class="chunk-title">Chunk ${index + 1}</div>
                <div class="chunk-actions">
                    <button class="chunk-btn chunk-download" data-id="${chunk.id}" title="Download">⬇</button>
                    <button class="chunk-btn chunk-delete" data-id="${chunk.id}" title="Delete">🗑</button>
                </div>
            </div>
        `;
        // clicking the card selects it (no preview)
        chunkDiv.addEventListener('click', (e) => {
            // ignore clicks on buttons inside the card
            if (e.target.closest('.chunk-btn')) return;
            state.selectedChunkId = chunk.id;
            renderChunks();
            showAlert(`Selected chunk ${index + 1}`, 'info');
        });
        chunkDiv.querySelector('.chunk-download').addEventListener('click', (ev) => {
            ev.stopPropagation();
            downloadChunk(chunk);
        });
        chunkDiv.querySelector('.chunk-delete').addEventListener('click', (ev) => {
            ev.stopPropagation();
            deleteChunk(chunk.id);
        });
        elements.chunksContainer.appendChild(chunkDiv);
    });
}

// ===== FFmpeg helper: trim original file to MP4 =====
async function sliceWithFFmpeg(file, start, duration, outputName = 'output.mp4') {
    if (!state.ffmpegLoaded || !state.ffmpeg || !state.fetchFile) {
        throw new Error('ffmpeg not ready');
    }
    const ff = state.ffmpeg;
    const fetchFile = state.fetchFile;
    const ext = (file.name && file.name.split('.').pop()) || 'input';
    const inputName = `input.${ext}`;
    try {
        // write original file into ffmpeg FS
        ff.FS('writeFile', inputName, await fetchFile(file));
        // run ffmpeg to cut and re-encode to MP4
        await ff.run(
            '-ss', String(start),
            '-i', inputName,
            '-t', String(duration),
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            outputName
        );
        const data = ff.FS('readFile', outputName);
        // cleanup FS
        try { ff.FS('unlink', inputName); } catch (e) {}
        try { ff.FS('unlink', outputName); } catch (e) {}
        return new Blob([data.buffer], { type: 'video/mp4' });
    } catch (err) {
        // cleanup on error
        try { ff.FS('unlink', inputName); } catch (e) {}
        try { ff.FS('unlink', outputName); } catch (e) {}
        throw err;
    }
}

// Replace downloadChunk: use ffmpeg on original file (no playback)
async function downloadChunk(chunk) {
    const start = Math.max(0, chunk.start);
    const end = Math.min(state.videoDuration, chunk.end);
    const duration = end - start;
    if (duration <= 0) {
        showAlert('Invalid chunk duration', 'warning');
        return;
    }

    try {
        await ensureFFmpegLoaded();
    } catch (e) {
        console.warn('ffmpeg failed to load', e);
    }

    if (state.ffmpegLoaded && state.ffmpeg) {
        showAlert('Creating MP4 chunk — this may take a while', 'info');
        try {
            const mp4Blob = await sliceWithFFmpeg(state.videoFile, start, duration, `chunk_${Date.now()}.mp4`);
            const url = URL.createObjectURL(mp4Blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `WhatsApp_Chunk_${formatTime(chunk.start).replace(/:/g, '-')}.mp4`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            showAlert(`Downloaded MP4 chunk: ${formatTime(chunk.start)} - ${formatTime(chunk.end)}`, 'success');
            return;
        } catch (err) {
            console.error('ffmpeg slicing error', err);
            showAlert('MP4 conversion failed — see console for details', 'error');
            // fallthrough to fallback below
        }
    } else {
        // explicit message so user knows why fallback happens
        console.warn('ffmpeg not available, falling back to original file download');
    }

    // Fallback: download original file (no preview)
    try {
        const link = document.createElement('a');
        const href = elements.videoPlayer.src || (state.videoFile ? URL.createObjectURL(state.videoFile) : '');
        link.href = href;
        link.download = state.videoFile ? state.videoFile.name : `video.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showAlert('FFmpeg unavailable — downloaded original file', 'info');
    } catch (err) {
        console.error(err);
        showAlert('Unable to download file', 'error');
    }
}

function seekVideoTo(time) {
    return new Promise((resolve) => {
        const onseeked = () => { elements.videoPlayer.removeEventListener('seeked', onseeked); resolve(); };
        elements.videoPlayer.addEventListener('seeked', onseeked);
        try { elements.videoPlayer.currentTime = Math.max(0, Math.min(state.videoDuration, time)); } catch (e) { elements.videoPlayer.removeEventListener('seeked', onseeked); resolve(); }
    });
}

// ===== EVENT LISTENERS =====
elements.uploadArea.addEventListener('click', () => elements.fileInput.click());
elements.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.add('dragging');
});
elements.uploadArea.addEventListener('dragleave', () => {
    elements.uploadArea.classList.remove('dragging');
});
elements.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
});
elements.fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
});

elements.videoPlayer.addEventListener('timeupdate', () => {
    if (state.previewingChunk) {
        if (elements.videoPlayer.currentTime >= state.currentSelection.end - 0.05) {
            elements.videoPlayer.pause();
            state.previewingChunk = false;
            showAlert('Preview ended', 'info');
        }
    }
    updateTimelineDisplay();
});

// Preview button -> if a chunk is selected, preview that chunk; otherwise preview current selection
document.getElementById('previewBtn').addEventListener('click', async () => {
    let sel = state.currentSelection;
    if (state.selectedChunkId) {
        const chunk = state.chunks.find(c => c.id === state.selectedChunkId);
        if (chunk) sel = { start: chunk.start, end: chunk.end };
    }
    state.currentSelection = { start: sel.start, end: sel.end };
    state.previewingChunk = true;
    try {
        await seekVideoTo(state.currentSelection.start);
        updateTimelineDisplay();
        elements.videoPlayer.play();
        showAlert('Playing selected chunk', 'info');
    } catch (e) {
        showAlert('Unable to seek for preview', 'error');
    }
});

document.getElementById('addChunkBtn').addEventListener('click', addChunk);
document.getElementById('autoChunkBtn').addEventListener('click', autoSplitChunks);
document.getElementById('resetTimelineBtn').addEventListener('click', () => {
    state.currentSelection = { start: 0, end: Math.min(60, state.videoDuration) };
    state.selectedChunkId = null;
    updateTimelineDisplay();
    showAlert('Timeline reset', 'info');
});

elements.startTimeInput.addEventListener('change', (e) => {
    const time = parseTime(e.target.value);
    if (time < state.currentSelection.end && time >= 0 && time <= state.videoDuration) {
        state.currentSelection.start = time;
        updateTimelineDisplay();
    } else {
        showAlert('Invalid start time', 'warning');
        updateTimelineDisplay();
    }
});
elements.endTimeInput.addEventListener('change', (e) => {
    const time = parseTime(e.target.value);
    if (time > state.currentSelection.start && time <= state.videoDuration) {
        state.currentSelection.end = time;
        updateTimelineDisplay();
    } else {
        showAlert('Invalid end time', 'warning');
        updateTimelineDisplay();
    }
});

function handlePointerMove(clientX) {
    if (!elements.timeline) return;
    if (state.isDraggingStart) {
        const time = getTimelinePosition(clientX);
        if (time < state.currentSelection.end) {
            state.currentSelection.start = Math.max(0, time);
            updateTimelineDisplay();
        }
    }
    if (state.isDraggingEnd) {
        const time = getTimelinePosition(clientX);
        if (time > state.currentSelection.start) {
            state.currentSelection.end = Math.min(state.videoDuration, time);
            updateTimelineDisplay();
        }
    }
    if (state.isDraggingPlayhead) {
        const time = getTimelinePosition(clientX);
        elements.videoPlayer.currentTime = Math.max(0, Math.min(state.videoDuration, time));
    }
}

document.addEventListener('mousemove', (e) => handlePointerMove(e.clientX));
document.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) handlePointerMove(e.touches[0].clientX);
}, { passive: false });
document.addEventListener('mouseup', () => {
    state.isDraggingStart = false;
    state.isDraggingEnd = false;
    state.isDraggingPlayhead = false;
});
document.addEventListener('touchend', () => {
    state.isDraggingStart = false;
    state.isDraggingEnd = false;
    state.isDraggingPlayhead = false;
});
window.addEventListener('resize', () => updateTimelineDisplay());
