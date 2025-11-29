// Global data object, simplified for the new requirements.
var data = {
    dpi: window.devicePixelRatio || 1,
    table: null,
    is_stopped: true,
    show_raw_spec: false,
    compact: false,

    // Core settings
    fft_size: 4096,
    piano_range: 'C3',
    spec_min_pitch: 'F2',
    spec_max_pitch: 'E5',
    spec_points_per_key: 15,
    raw_spec_height: 500,

    // Theming
    background_color: '#1a202c',
    text_color: '#e2e8f0',
    line_color: '#4a5568',
    border_color: '#4fd1c5',
    hover_color: '#81e6d9',
    piano_white_color: '#ffffff',
    piano_dark_color: '#2d3748',
    vocal_audio_color: '#f6e05e',
    vocal_audio_pitch_color: '#faf089',

    init: function () {
        this.compact = window.innerWidth < 768;
        this.loadJson();
    },

    loadJson: function () {
        var self = this;
        // This JSON file contains pitch frequency data, essential for the piano and pitch detection.
        jQuery.when(
            jQuery.getJSON("./pitch.json", function (jsonData) {
                self.pitch_data = jsonData.pitch_data;
            })
        ).then(function () {
            new MainFunction();
        });
    },

    getAudioCtx: function () {
        if (!this.audio_ctx) {
            this.audio_ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.audio_ctx;
    }
};

class MainFunction {
    constructor() {
        this.main = new Main();
        this.main.init();
    }
}

class Main {
    constructor() {
        let canvas = document.getElementById("canvas");
        data.ctx = canvas.getContext('2d');
        data.view = new View(data.ctx);
        data.controller = new Controller();
        data.table = new Table();
        window.requestAnimationFrame(draw);
    }

    init() {
        window.onresize = function () {
            data.controller.reload();
        }
        data.controller.reload();
        data.table.processAudios(); // Prepare microphone
    }
}

class Controller {
    constructor() {
        this.recordButton = document.getElementById('recordButton');
        this.recordButtonText = this.recordButton.querySelector('span');
        this.viewSwitch = document.getElementById('viewSwitch');
        this.initControls();
    }

    initControls() {
        this.recordButton.onclick = () => {
            if (data.is_stopped) {
                data.table.play();
            } else {
                data.table.stop();
            }
            this.updateRecordButton();
        };

        this.viewSwitch.onchange = (e) => {
            data.show_raw_spec = e.target.checked;
        };
    }

    updateRecordButton() {
        if (data.is_stopped) {
            this.recordButtonText.textContent = '開始錄音';
            this.recordButton.classList.remove('recording');
        } else {
            this.recordButtonText.textContent = '停止錄音';
            this.recordButton.classList.add('recording');
        }
    }

    reload() {
        let view = data.view;
        let ctx = data.ctx;

        // --- FIX START: More robust canvas sizing ---
        const headerHeight = data.compact ? 110 : 70; // Get header height based on compact mode
        let width = window.innerWidth;
        let height = window.innerHeight - headerHeight;

        ctx.canvas.width = width * data.dpi;
        ctx.canvas.height = height * data.dpi;
        ctx.canvas.style.width = width + 'px';
        ctx.canvas.style.height = height + 'px';
        ctx.setTransform(data.dpi, 0, 0, data.dpi, 0, 0);
        // --- FIX END ---

        data.compact = window.innerWidth < 768;
        data.table.reload();

        view.setPos(0, 0, width, height);
    }
}

// --- CORE LOGIC (simplified and refactored) ---

class Item {
    constructor(json) {
        for (var key in json) {
            this[key] = json[key];
        }
        this.fill_color = data.background_color;
        this.stroke_color = data.line_color;
        this.hover_color = data.hover_color;
        this.width = 100;
        this.height = 100;
        this.left = 100;
        this.top = 100;
        this.radii = 0;
        this.is_hover = false;
    }

    get right() {
        return this.left + this.width;
    }
    get bottom() {
        return this.top + this.height;
    }
    get center_x() {
        return this.left + this.width / 2;
    }
    get center_y() {
        return this.top + this.height / 2;
    }

    hasPos(x, y) {
        return this.hasX(x) && this.hasY(y);
    }
    hasY(y) {
        return y > this.top && y < this.bottom;
    }
    hasX(x) {
        return x > this.left && x < this.right;
    }

    draw() {
        let ctx = data.ctx;
        ctx.fillStyle = this.fill_color;
        if (data.hover_pitch == this) {
            ctx.fillStyle = this.hover_color;
        }
        ctx.strokeStyle = this.stroke_color;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(this.left, this.top, this.width, this.height, [this.radii]);
        } else {
            ctx.rect(this.left, this.top, this.width, this.height);
        }
        if (this.stroke_color) ctx.stroke();
        if (this.fill_color) ctx.fill();
    }

    click() {

    }
}

class Color {
    constructor(hex) {
        if (!hex.startsWith('#')) {
            hex = '#' + hex;
        }
        this.hex = hex;
        this.r = parseInt(hex.slice(1, 3), 16);
        this.g = parseInt(hex.slice(3, 5), 16);
        this.b = parseInt(hex.slice(5, 7), 16);
        this.a = 1;
    }
    get alpha() {
        return this.a;
    }
    get inta() {
        return (int)(this.a * 255);
    }
    set alpha(value) {
        if (isNaN(value)) {
            value = 0;
        }
        this.a = value;
    }
    get str() {
        return `rgba(${this.convert(this.r)}, ${this.convert(this.g)}, ${this.convert(this.b)}, ${this.a})`;
    }
    convert(value) {
        return value;
    }
    isDark() {
        var o = (this.convert(this.r) * 299 + this.convert(this.g) * 587 +
            this.convert(this.b) * 114) / 1000;
        return o < 150;
    }
}

class Pitch extends Item {
    constructor(json) {
        super(json);
        this.is_white = this.inter.indexOf('#') === -1 && this.inter.indexOf('/') === -1;
        this.fill_color = this.is_white ? data.piano_white_color : data.piano_dark_color;
        this.text_color = data.text_color; // Simplified color

        this.log_freq = Math.log(this.freq);
        if (!this.is_white) {
            this.inter = this.inter.substring(0, 2);
        }
    }

    setSimpleName(name, level) {
        this.simple = `${name}`;
        this.level = level;
        this.display_on_piano = (name === 1); // Only show C notes
        this.display_on_spec = true;
    }

    getDisplayName() {
        return this.inter.slice(0, -1); // Display C, D, E instead of C4, D4, etc. on keys
    }

    draw() {
        super.draw();
    }
    // Removed onClick to prevent errors
}

class ImageDataWithDpi {
    constructor(w, h, dpi) {
        this.dpi = dpi;
        this.w = w * dpi;
        this.h = h * dpi;
        this.width = w;
        this.height = h;
        this.start_x = 0;
        this.end_x = 1;
        this.image_data = data.view.ctx.createImageData(this.w, this.h);
    }

    fillPoint(x, y, color) {
        x += this.start_x;
        x %= this.width;
        this.end_x = x;
        let dpi = this.dpi;
        x *= dpi;
        y *= dpi;
        for (let i = 0; i < dpi; i++) {
            for (let j = 0; j < dpi; j++) {
                let index = (y + j) * this.w + x + i;
                index *= 4;
                this.image_data.data[index] = color.r;
                this.image_data.data[index + 1] = color.g;
                this.image_data.data[index + 2] = color.b;
                this.image_data.data[index + 3] = color.a * 255;

            }
        }
    }

    cutHalf(x) {
        this.start_x += x;
        this.start_x %= this.width;
    }

    clearAfter(x) {
        x--;
        x += this.start_x;
        x %= this.width;
        this.end_x = x;
    }

    finalize() {
        let canvas2 = document.createElement("canvas");
        canvas2.width = this.w;
        canvas2.height = this.h;
        let ctx2 = canvas2.getContext("2d");
        ctx2.putImageData(this.image_data, 0, 0);
        this.image = new Image();
        this.image.src = canvas2.toDataURL("image/png");
        this.done = true;
    }

    draw(x, y, parent) {
        let dpi = this.dpi;
        let ctx = data.view.ctx;

        // 如果最終的圖像已經被快取，直接繪製它。
        // 這種情況下，它的位置由呼叫者傳入的 x, y 決定。
        if (this.image) {
            ctx.drawImage(this.image, x, y, this.width, this.height);
            return;
        }

        // --- 核心修正：處理循環緩衝區的繪製 ---
        // 這個函式的職責是在指定的 (x, y) 位置開始繪製。
        // View.drawRawSpec 會透過 ctx.clip() 來確保它只在可見區域內顯示。

        // 獲取當前緩衝區中有效資料的寬度。
        const internal_width = this.getInternalWidth();
        if (internal_width <= 0) return;

        // 計算從緩衝區起始點到陣列末尾可以繪製的第一段寬度。
        let width_part1 = this.width - this.start_x;
        if (width_part1 > internal_width) {
            width_part1 = internal_width;
        }

        // 繪製第一部分。
        if (width_part1 > 0) {
            ctx.putImageData(
                this.image_data,
                Math.floor(x), Math.floor(y), // 繪製到畫布的目標位置
                Math.floor(this.start_x * dpi), 0, // 從源圖像數據中截取的區域
                Math.floor(width_part1 * dpi), Math.floor(this.h)
            );
        }

        // 如果資料在緩衝區中發生了環繞，則繪製第二部分。
        const width_part2 = internal_width - width_part1;
        if (width_part2 > 0) {
            ctx.putImageData(
                this.image_data,
                Math.floor(x + width_part1), Math.floor(y), // 緊跟在第一部分後面繪製
                0, 0, // 從源圖像數據的開頭截取
                Math.floor(width_part2 * dpi), Math.floor(this.h)
            );
        }
    }

    xToInternalX(x) {
        return (x + this.start_x) % this.width;
    }

    getInternalWidth() {
        return (this.end_x + 1 + this.width - this.start_x) % this.width;
    }
}

// ... (保留文件顶部的其他类) ...

class PitchSegment {
    constructor(start_index) {
        this.start_index = start_index;
        this.end_index = start_index;
        this.vocal_items = [];
        this.average_pitch_point = 0;
        // --- NEW: Add properties for voice type analysis ---
        this.average_base_eng = 0;
        this.average_max_value = 0;
    }

    add(vocal_item) {
        this.vocal_items.push(vocal_item);
        this.end_index++;
    }

    finalize(sample_rate, fft_size, fft_scale) {
        if (this.vocal_items.length === 0) return;

        let pitch_sum = 0;
        let base_eng_sum = 0;
        let max_value_sum = 0;

        for (const item of this.vocal_items) {
            pitch_sum += item.pitch_point;
            base_eng_sum += item.base_eng;
            max_value_sum += item.max_value;
        }

        // --- UPDATED: Calculate averages for all required values ---
        this.average_pitch_point = pitch_sum / this.vocal_items.length;
        this.average_base_eng = base_eng_sum / this.vocal_items.length;
        this.average_max_value = max_value_sum / this.vocal_items.length;

        const duration_in_indices = this.end_index - this.start_index;
        this.duration = duration_in_indices / sample_rate * fft_size / fft_scale;

        const average_freq = data.table.spec_item.absoluteYtoFreq(this.average_pitch_point);
        const pitch_obj = data.table.getPitchForFreq(average_freq);
        this.average_pitch_name = pitch_obj ? pitch_obj.inter : '';
    }

    // --- NEW: Voice type detection logic from the snippet ---
    getRealText() {
        let base = this.average_base_eng;
        let total = this.average_max_value;
        if (base <= 0) return '';
        let pure = total / base * 1.3;
        if (pure < 2) {
            return '假出翔';
        } else if (pure < 3) {
            return '纯假声';
        } else if (pure < 4) {
            return '假声';
        } else if (pure < 5) {
            return '半假声';
        } else if (pure < 6) {
            return '混声';
        } else if (pure < 20) {
            return '真声';
        } else {
            return '纯真声';
        }
    }

    // --- UPDATED: Info text formatting ---
    getInfoText() {
        if (!this.average_pitch_name || this.duration < 0.1) {
            return '';
        }

        const voiceType = this.getRealText();
        if (voiceType) {
            return `${this.duration.toFixed(1)}s ${this.average_pitch_name} ${voiceType}`;
        } else {
            return `${this.duration.toFixed(1)}s ${this.average_pitch_name}`;
        }
    }
}

class AudioItem extends Item {
    constructor() {
        super([]);
        this.path = 'mic';
        this.name = '麥克風';
        this.vocal_items = [];
        this.fft_data = new Uint8Array(data.fft_size);
        this._current_index = 0;
        this.raw_spec_image = null;
        this.is_mic = true;
        this.fft_scale = 4;
        this.sample_rate = 44100;
        this.setColors(data.vocal_audio_color, data.vocal_audio_pitch_color);
        this.raw_spec_image = new ImageDataWithDpi(5000, data.raw_spec_height, 1);
        this.processed = true;

        this.pitch_segments = [];
        this.current_segment = null;
        this.PITCH_JUMP_THRESHOLD = 30;
    }

    get current_index() { return this._current_index; }
    set current_index(i) { this._current_index = i; }

    getCurrentVocalItem() {
        if (this.is_mic && !data.is_stopped) {
            return this.vocal_items[this.vocal_items.length - 1];
        }
        return this.getVocalItem(this.current_index - 1);
    }

    startMic() {
        if (this.stream) return;
        let self = this;
        function callback(stream) {
            var ctx = data.getAudioCtx();
            var mic = ctx.createMediaStreamSource(stream);
            self.source = mic;
            self.stream = stream;
            self.sample_rate = ctx.sampleRate;
            let analyser = new AnalyserNode(ctx, {
                fftSize: data.fft_size,
                maxDecibels: 0,
                minDecibels: -140,
                smoothingTimeConstant: 0.0,
            });
            self.analyser = analyser;
            mic.connect(analyser);
        }
        navigator.mediaDevices.getUserMedia({ video: false, audio: true })
            .then(callback)
            .catch(error => console.error('Error accessing media devices.', error));
    }

    play() {
        this.cutCurrent();
        this.startMic();
    }

    stop() {
        if (this.is_mic && this.stream) {
            this.stream.getAudioTracks().forEach(track => track.stop());
            if (this.source) this.source.disconnect(this.analyser);
            delete this.source;
            delete this.stream;
        }
    }

    updatePlayTime() {
        if (data.is_stopped) {
            return;
        }
        if (this.is_mic && this.analyser) {
            this.processFft();
        }
        this.current_index = this.getSize();
    }

    processFft() {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(this.fft_data);
        let fft = this.fft_data;

        let vocal_item = new VocalItem(this, fft);
        this.addVocalItem(vocal_item);

        const has_pitch = vocal_item.hasPitch();
        if (this.current_segment) {
            const last_pitch_point = this.current_segment.vocal_items[this.current_segment.vocal_items.length - 1].pitch_point;
            const jump = Math.abs(vocal_item.pitch_point - last_pitch_point);

            if (!has_pitch || jump > this.PITCH_JUMP_THRESHOLD) {
                this.finalizeCurrentSegment();
            } else {
                this.current_segment.add(vocal_item);
            }
        }

        if (has_pitch && !this.current_segment) {
            this.current_segment = new PitchSegment(this.getSize() - 1);
            this.current_segment.add(vocal_item);
        }

        let image = this.raw_spec_image;
        if (image) {
            let x = this.getSize() - 1;
            let height = image.height;
            let pitch_index = -1;
            if (vocal_item && vocal_item.pitch_freq > 0) {
                pitch_index = Math.round(vocal_item.pitch_freq / this.sample_rate * data.fft_size);
            }
            for (let i = 0; i < height && i < fft.length; i++) {
                let eng = fft[i];
                let color = this.getColor(eng / 255);
                if (pitch_index == i) {
                    color = this.pitch_color;
                }
                if (color) {
                    image.fillPoint(x, height - i, color);
                }
            }
        }

        if (this.is_mic && this.getSize() >= 2400) {
            this.cutHalf();
        }
    }

    finalizeCurrentSegment() {
        if (!this.current_segment) return;
        this.current_segment.finalize(this.sample_rate, data.fft_size, this.fft_scale);
        this.pitch_segments.push(this.current_segment);
        this.current_segment = null;
    }

    addVocalItem(vocal_item) {
        this.vocal_items.push(vocal_item);
    }

    getVocalItem(i) {
        i = Math.round(i);
        if (i < 0 || i >= this.getSize()) {
            return null;
        }
        return this.vocal_items[i];
    }

    getSize() { return this.vocal_items.length; }
    
    getColor(eng) {
        if (eng < 0.3) return null;
        let p = (eng - 0.3) / (0.8 - 0.3);
        if (p > 1) p = 1;
        let color = new Color(this.color.hex);
        color.alpha = p;
        return color;
    }

    cutHalf() {
        let n = this.getSize();
        let new_n = Math.floor(n / 2);
        let cut_point = n - new_n;

        this.vocal_items = this.vocal_items.slice(cut_point);
        if (this.raw_spec_image) {
            this.raw_spec_image.cutHalf(cut_point);
        }

        this.pitch_segments = this.pitch_segments.filter(seg => seg.end_index >= cut_point);
        this.pitch_segments.forEach(seg => {
            seg.start_index -= cut_point;
            seg.end_index -= cut_point;
        });
        if (this.current_segment) {
            this.current_segment.start_index -= cut_point;
            this.current_segment.end_index -= cut_point;
        }
    }

    cutCurrent() {
        // --- FIX: Finalize before clearing ---
        // Finalize any active segment before clearing the data.
        this.finalizeCurrentSegment();
        
        let new_n = Math.floor(this.current_index);
        new_n = Math.max(new_n, 0);
        this.vocal_items = this.vocal_items.slice(0, new_n);

        this.pitch_segments = this.pitch_segments.filter(seg => seg.end_index < new_n);

        if (this.raw_spec_image) {
            this.raw_spec_image.clearAfter(new_n);
        }
    }

    setColors(color, pitch_color) {
        this.color = new Color(color);
        this.pitch_color = new Color(pitch_color);
    }
}

class VocalItem extends Item {
    static fft_map = [];
    static start_point = 0;
    static end_point = 0;
    static vocal_range = 8;
    static top_range = 3;
    static level_n = 20;

    constructor(audio_item, fft) {
        super();
        this.fft = fft;
        this.audio_item = audio_item;
        this.peak_eng = 0;
        this.reset();
        
        // --- NEW: Add properties for voice type analysis ---
        this.base_eng = 0;
        this.max_value = 0;

        this.guessPitch();
    }

    pitchToPoint(pitch_name) {
        let pitch = data.table.getPitch(pitch_name);
        return data.table.spec_item.freqToAbsoluteY(pitch.freq);
    }

    reset() {
        this.pitch_point = 0;
        this.pitch_freq = 0;
        this.pitch_name = null;
    }

    hasPitch() {
        return this.pitch_point > 0;
    }

    guessPitch() {
        let fft = this.fft;
        let table = data.table;

        if (VocalItem.fft_map.length == 0 && table.pitches.length > 0) {
            VocalItem.start_point = Math.round(this.pitchToPoint('C2'));
            VocalItem.end_point = Math.round(this.pitchToPoint('C8'));
            for (let i = VocalItem.start_point; i < VocalItem.end_point; i++) {
                let arr = [];
                let freq = data.table.spec_item.absoluteYtoFreq(i);
                for (let level = 1; level < VocalItem.level_n; level++) {
                    if (freq * level > 7000) break;
                    let index = this.freqToIndex(freq * level);
                    index = Math.round(index);
                    arr.push(index);
                }
                VocalItem.fft_map.push(arr);
            }
        }
        if (VocalItem.fft_map.length === 0) return;

        let is_tops = this.isTop(fft);
        if (this.peak_eng < 150) {
            return;
        }

        let max_value = 0;
        let pitch_point = 0;
        let end_point = VocalItem.end_point;
        let highest_point = this.indexToPoint(this.highest_index) + VocalItem.vocal_range + 3;
        end_point = Math.min(end_point, highest_point);
        let last_value = -1;
        
        // --- Temporary variable for best base_eng ---
        let best_base_eng = 0;

        for (let i = VocalItem.start_point; i < end_point; i++) {
            let map = VocalItem.fft_map[i - VocalItem.start_point];
            if (!map) continue;
            let calculate_value = 0;
            let missed = 1;
            let base_eng = 0;
            for (let level = 0; level < map.length; level++) {
                let index = map[level];
                let value = fft[index];
                if (level == 0) {
                    base_eng = value;
                }
                if (is_tops[index]) {
                    if (level > 0) {
                        value -= Math.abs(value - last_value);
                    }
                    calculate_value += value / missed;
                } else if (level > 0 || index < 30) {
                    missed++;
                }
                last_value = value;
            }
            if (calculate_value > max_value) {
                max_value = calculate_value;
                pitch_point = i;
                // --- UPDATED: Store the base_eng associated with the max_value ---
                best_base_eng = base_eng;
            }
        }
        
        // --- UPDATED: Save the final values to the instance ---
        this.max_value = max_value;
        this.base_eng = best_base_eng;
        this.pitch_point = pitch_point;

        if (pitch_point > 0) {
            this.pitch_freq = table.spec_item.absoluteYtoFreq(this.pitch_point);
            const foundPitch = table.getPitchForFreq(this.pitch_freq);
            if (foundPitch) {
                this.pitch_name = foundPitch.inter;
            }
        }
    }

    isTop(fft) {
        let highest_index = 0;
        let highest_eng = 0;
        for (let i = 9; i < fft.length - 2; ++i) {
            let value = fft[i];
            if (value > highest_eng) {
                highest_index = i;
                highest_eng = value;
            }
        }

        let n = fft.length;
        let is_tops = new Int8Array(n);

        function isTop(index, delta) {
            if (fft[index] < highest_eng - 70) return false;
            for (let i of [1, 2]) {
                let j = index + delta * i;
                if (j < 0 || j >= n) break;
                if (fft[j] > fft[index]) return false;
            }
            return true;
        }

        for (let i = 1; i < n - 1; i++) {
            if (isTop(i, 1) && isTop(i, -1)) {
                for (let j = i - VocalItem.top_range; j <= i + VocalItem.top_range; j++) {
                    if (j >= 0 && j < n) is_tops[j] = true;
                }
            }
        }
        this.highest_index = highest_index;
        this.peak_eng = highest_eng;
        return is_tops;
    }

    indexToPoint(index) {
        let rate = this.audio_item.sample_rate;
        let freq = index / data.fft_size * rate;
        return data.table.spec_item.freqToAbsoluteY(freq);
    }

    freqToIndex(freq) {
        let rate = this.audio_item.sample_rate;
        return freq * data.fft_size / rate;
    }
}

class SpecItem extends Item {
    constructor() {
        super([]);
        let table = data.table;
        let min_pitch = table.getPitch(data.spec_min_pitch);
        let max_pitch = table.getPitch(data.spec_max_pitch);

        if (!min_pitch || !max_pitch) { // Guard against missing pitches
            this.valid = false;
            return;
        }
        this.valid = true;

        this.min_y = min_pitch.freq;
        this.max_y = max_pitch.freq;
        // --- REFACTOR START ---
        // 'total_height' represents the full logical height of all possible pitches.
        // 'height' will represent the visible height on the canvas, set by the View.
        this.total_height = data.spec_points_per_key * (max_pitch.index - min_pitch.index);
        // --- REFACTOR END ---
        this.y_range = this.log(this.max_y) - this.log(this.min_y);
        this.min_absolute_y = this.freqToAbsoluteY(this.min_y);
        this.stroke_color = data.border_color;
        this.delta_y = 0;
    }

    log(freq) { return Math.log(freq); }

    freqToAbsoluteY(freq) {
        if (!this.valid) return 0;
        let p = this.log(freq) / this.y_range;
        // Use total_height for correct scaling
        return p * this.total_height;
    }

    freqToY(freq) {
        let absolute_y = this.freqToAbsoluteY(freq);
        return this.absoluteYtoY(absolute_y);
    }

    absoluteYtoY(yy) {
        if (!this.valid) return 0;
        // 'this.bottom' is calculated from the visible height, which is correct
        return this.bottom - (yy - this.min_absolute_y) - this.delta_y;
    }

    yToLogFreq(y) {
        if (!this.valid) return 0;
        y = this.bottom - y;
        y -= this.delta_y;
        y += this.min_absolute_y;
        // Use total_height for correct scaling
        return y / this.total_height * this.y_range;
    }

    absoluteYtoFreq(y) {
        if (!this.valid) return 0;
        // Use total_height for correct scaling
        return Math.pow(Math.E, y / this.total_height * this.y_range);
    }

    move(x, y) {
        this.delta_y -= y;
    }
}

class RawSpecItem extends Item {
    constructor() {
        super([]);
        this.height = data.raw_spec_height;
        this.stroke_color = data.border_color;
    }

    yToFreq(y) {
        y = this.bottom - y;
        return y * data.table.getSampleRate() / data.fft_size;
    }
    freqToY(freq) {
        let y = freq * data.fft_size / data.table.getSampleRate();
        return this.bottom - y;
    }
}

class Table {
    reload() {
        this.reloadPitches();
        this.piano = new Item([]);
        this.spec_item = new SpecItem();
        this.raw_spec_item = new RawSpecItem();
        if (!this.vocal_audio) {
            this.vocal_audio = new AudioItem();
        }
    }

    reloadPitches() {
        if (!data.pitch_data) return;
        this.pitches = [];
        this.pitch_map = {};
        this.white_pitches = [];
        this.dark_pitches = [];
        for (let key in data.pitch_data) {
            let pitch = new Pitch(data.pitch_data[key]);
            this.pitches.push(pitch);
            this.pitch_map[pitch.inter] = pitch;
            if (pitch.is_white) this.white_pitches.push(pitch);
            else this.dark_pitches.push(pitch);
        }
    }

    processAudios() { }

    play() {
        if (this.vocal_audio) this.vocal_audio.play();
        data.is_stopped = false;
    }

    stop() {
        if (data.is_stopped) return;
        data.is_stopped = true;
        if (this.vocal_audio) this.vocal_audio.stop();
    }

    updatePlayTime() {
        if (this.vocal_audio) this.vocal_audio.updatePlayTime();
    }

    getShowAudios() { return this.vocal_audio ? [this.vocal_audio] : []; }
    getLastAudio() { return this.vocal_audio; }
    getFirstAudio() { return this.vocal_audio; }
    getSampleRate() { return this.vocal_audio ? this.vocal_audio.sample_rate : 44100; }
    getPitch(name) { return this.pitch_map[name]; }

    getPitchForFreq(freq) {
        let log_freq = Math.log(freq);
        return this.getPitchForLogFreq(log_freq);
    }

    getPitchForLogFreq(log_freq) {
        let min_delta = 1000;
        let hover_pitch = null;
        if (!this.pitches) return null;
        for (let pitch of this.pitches) {
            let delta = Math.abs(pitch.log_freq - log_freq);
            if (delta < min_delta) {
                min_delta = delta;
                hover_pitch = pitch;
            }
        }
        return hover_pitch;
    }

    getHoverPitch(x, y) {
        if (!this.dark_pitches || !this.white_pitches) return null;
        for (let pitch of this.dark_pitches) {
            if (pitch.hasPos(x, y)) return pitch;
        }
        for (let pitch of this.white_pitches) {
            if (pitch.hasPos(x, y)) return pitch;
        }
        return null;
    }

    onHover(x, y) {
        data.hover_x = x;
        let hover_pitch = null;
        if (this.piano && this.piano.hasPos(x, y)) {
            hover_pitch = this.getHoverPitch(x, y);
        } else if (this.spec_item && !data.show_raw_spec && this.spec_item.hasPos(x, y)) {
            let log_freq = this.spec_item.yToLogFreq(y);
            hover_pitch = this.getPitchForLogFreq(log_freq);
        } else if (this.raw_spec_item && data.show_raw_spec && this.raw_spec_item.hasPos(x, y)) {
            let freq = this.raw_spec_item.yToFreq(y);
            hover_pitch = this.getPitchForFreq(freq);
        }
        data.hover_pitch = hover_pitch;
    }

    move(x, y) {
        if (this.spec_item) this.spec_item.move(x, y);
    }
}

class View {
    constructor(ctx) {
        this.ctx = ctx;
        this.top = 10;
        this.left = data.compact ? 10 : 40;
        this.right = data.compact ? 10 : 40;
        this.bottom = 30;
        this.initMouse();
    }

    initMouse() {
        var canvas = document.getElementById('canvas');
        let is_dragging_spec = false;
        let drag_start = { x: 0, y: 0 };
        let drag_middle = drag_start;
        let is_stopped_on_down = false;

        const onPointerDown = (e) => {
            if (!data.table || !data.table.spec_item || !data.table.spec_item.valid) return;
            is_stopped_on_down = data.is_stopped;
            let pos = util.getEventLocation(e);
            let rect = canvas.getBoundingClientRect();
            let x = pos.x - rect.left;
            let y = pos.y - rect.top;

            is_dragging_spec = data.table.spec_item.hasPos(x, y) || data.table.raw_spec_item.hasPos(x, y);
            if (is_dragging_spec) {
                drag_start = pos;
                drag_middle = pos;
                data.table.stop();
                data.controller.updateRecordButton();
                e.preventDefault();
            }
        };

        const onPointerUp = (e) => {
            if (is_dragging_spec && is_stopped_on_down) {
                if (Math.abs(drag_start.x - drag_middle.x) + Math.abs(drag_start.y - drag_middle.y) < 10) {
                    data.table.play();
                    data.controller.updateRecordButton();
                }
            }
            is_dragging_spec = false;
        };

        const onPointerMove = (e) => {
            if (!data.table || !data.table.spec_item || !data.table.spec_item.valid) return;
            let pos = util.getEventLocation(e);
            let rect = canvas.getBoundingClientRect();
            let x = pos.x - rect.left;
            let y = pos.y - rect.top;
            data.table.onHover(x, y);

            if (is_dragging_spec) {
                let dy = pos.y - drag_middle.y;
                data.table.move(pos.x - drag_middle.x, dy);
                drag_middle = pos;
                e.preventDefault();
            }
        };

        canvas.addEventListener('mousedown', onPointerDown);
        canvas.addEventListener('mouseup', onPointerUp);
        canvas.addEventListener('mousemove', onPointerMove);
        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onPointerDown(e); }, { passive: false });
        canvas.addEventListener('touchend', (e) => { e.preventDefault(); onPointerUp(e); }, { passive: false });
        canvas.addEventListener('touchmove', (e) => { e.preventDefault(); onPointerMove(e); }, { passive: false });
    }

    setPos(x, y, width, height) {
        this.x = x; this.y = y; this.width = width; this.height = height;
        this.rx = this.x + this.left; this.ry = this.y + this.top;
        this.rwidth = this.width - this.left - this.right;
        this.rheight = this.height - this.top - this.bottom;
    }

    draw() {
        var table = data.table;
        if (!table.pitches || !table.piano) return;
        var ctx = this.ctx;
        ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = data.background_color;
        ctx.fillRect(0, 0, ctx.canvas.width / data.dpi, ctx.canvas.height / data.dpi);
        ctx.save();
        table.updatePlayTime();
        this.drawPiano();
        if (data.show_raw_spec) {
            this.drawRawSpec();
        } else {
            this.drawSpec();
        }
        ctx.restore();
    }

    drawPiano() {
        var table = data.table;
        var ctx = this.ctx;
        if (!table.white_pitches || table.white_pitches.length === 0) return;

        let n = table.white_pitches.length;
        let piano_height = Math.min((this.width - this.x * 2) / 12, 80);
        let white_width = this.rwidth / n;
        let dark_width = white_width * 0.6;
        let dark_height = piano_height * 0.65;

        ctx.save();
        let x_pos = this.rx;
        let piano = table.piano;
        piano.left = this.rx;
        piano.top = this.ry;
        piano.width = this.rwidth;
        piano.height = piano_height;

        table.white_pitches.forEach(pitch => {
            pitch.left = x_pos;
            pitch.top = this.ry;
            pitch.width = white_width;
            pitch.height = piano_height;
            x_pos += white_width;
        });

        let last_white_pitch = null;
        table.pitches.forEach(pitch => {
            if (pitch.is_white) {
                last_white_pitch = pitch;
            } else if (last_white_pitch) {
                pitch.left = last_white_pitch.right - dark_width / 2;
                pitch.top = this.ry;
                pitch.width = dark_width;
                pitch.height = dark_height;
            }
        });

        table.white_pitches.forEach(p => p.draw());
        table.dark_pitches.forEach(p => p.draw());

        ctx.font = data.compact ? '10px sans-serif' : '12px sans-serif';
        ctx.fillStyle = data.text_color;
        let white_bottom = piano.top + piano.height - (data.compact ? 8 : 15);

        table.white_pitches.forEach(pitch => {
            if (pitch.inter.startsWith('C')) {
                this.paintText(pitch.inter, pitch.center_x, white_bottom, 'center', 'middle', data.line_color);
            }
        });

        ctx.globalAlpha = 0.4;
        if (data.hover_pitch) {
            let p = data.hover_pitch;
            ctx.fillStyle = data.hover_color;
            ctx.fillRect(p.left, p.top, p.width, p.height);
        }

        ctx.globalAlpha = 0.9;
        let audio_item = table.getLastAudio();
        if (audio_item && !data.is_stopped) {
            let vocal_item = audio_item.getCurrentVocalItem();
            if (vocal_item && vocal_item.pitch_name) {
                let current_pitch = table.getPitch(vocal_item.pitch_name);
                if (current_pitch) {
                    ctx.fillStyle = data.vocal_audio_pitch_color;
                    ctx.fillRect(current_pitch.left, current_pitch.top, current_pitch.width, current_pitch.height);
                }
            }
        }

        ctx.restore();
        this.y = piano.bottom + 5;
    }

    drawSpec() {
        let table = data.table;
        let spec = table.spec_item;
        if (!spec || !spec.valid) return;
        let ctx = this.ctx;

        ctx.save();

        spec.left = this.rx;
        spec.top = this.y;
        spec.width = this.rwidth;
        spec.height = (this.ry + this.rheight) - spec.top;

        if (spec.height <= 0) {
            ctx.restore();
            return;
        }

        let audio_item = table.getFirstAudio();
        if (audio_item && !data.is_stopped) {
            let last_vocal_item = audio_item.getCurrentVocalItem();
            if (last_vocal_item && last_vocal_item.hasPitch()) {
                const target_y = spec.top + spec.height / 2;
                const current_pitch_y_unpanned = spec.bottom - (last_vocal_item.pitch_point - spec.min_absolute_y);
                let new_delta_y = current_pitch_y_unpanned - target_y;
                const max_delta_y = spec.total_height - spec.height;
                const min_delta_y = 0;
                const final_max_delta = Math.max(0, max_delta_y);
                spec.delta_y = Math.max(min_delta_y, Math.min(new_delta_y, final_max_delta));
            }
        }

        spec.draw();

        ctx.globalAlpha = 0.4;
        for (let pitch of table.pitches) {
            let y = spec.freqToY(pitch.freq);
            if (spec.hasY(y)) {
                let color = (pitch === data.hover_pitch) ? data.hover_color : data.line_color;
                this.drawHorizontalLine(spec, y, pitch, color);
            }
        }

        // --- FIX START: Apply clipping path ---
        // 1. Save the current state (before clipping)
        ctx.save();
        // 2. Create a clipping path that matches the spec item's boundaries
        ctx.beginPath();
        ctx.rect(spec.left, spec.top, spec.width, spec.height);
        ctx.clip();
        // Now, all subsequent drawing will be confined to this rectangle.
        // --- FIX END ---

        ctx.globalAlpha = 1.0;
        if (audio_item) {
            const x_offset = spec.center_x - audio_item.current_index;
            ctx.strokeStyle = data.vocal_audio_color;
            ctx.lineWidth = 1.5;

            const all_segments = audio_item.current_segment
                ? [...audio_item.pitch_segments, audio_item.current_segment]
                : audio_item.pitch_segments;

            for (const segment of all_segments) {
                if (segment.vocal_items.length < 2) continue;

                ctx.beginPath();
                for (let i = 0; i < segment.vocal_items.length; i++) {
                    const item = segment.vocal_items[i];
                    const x = x_offset + segment.start_index + i;
                    const y = spec.absoluteYtoY(item.pitch_point);

                    if (x < spec.left) continue;
                    if (x > spec.right) break;

                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.stroke();
            }

            const last_segment = audio_item.current_segment || audio_item.pitch_segments[audio_item.pitch_segments.length - 1];
            if (last_segment) {
                if (last_segment === audio_item.current_segment) {
                    last_segment.finalize(audio_item.sample_rate, data.fft_size, audio_item.fft_scale);
                }

                const info = last_segment.getInfoText();
                if (info) {
                    const y = spec.absoluteYtoY(last_segment.average_pitch_point);
                    this.paintText(info, spec.center_x + 10, y, 'left', 'middle', data.vocal_audio_pitch_color, 32);
                }
            }
        }

        // --- FIX START: Restore from clipping ---
        // 3. Restore the context to remove the clipping path
        ctx.restore();
        // --- FIX END ---

        // Draw elements that should NOT be clipped (like the timeline)
        this.drawVerticalLine(spec, spec.center_x, "當前", data.border_color);
        
        ctx.restore(); // Restore the initial save() at the beginning of the function
    }

    drawRawSpec() {
        let table = data.table;
        let spec = table.raw_spec_item;
        if (!spec) return;
        let ctx = this.ctx;

        ctx.save();

        spec.left = this.rx;
        spec.top = this.y;
        spec.width = this.rwidth;
        spec.height = (this.ry + this.rheight) - spec.top;

        if (spec.height <= 0) {
            ctx.restore();
            return;
        }

        spec.draw();

        ctx.beginPath();
        ctx.rect(spec.left, spec.top, spec.width, spec.height);
        ctx.clip();

        ctx.globalAlpha = 1;
        let audio_item = table.getFirstAudio();
        if (audio_item && audio_item.raw_spec_image) {
            let x_start = spec.center_x - audio_item.current_index;
            audio_item.raw_spec_image.draw(x_start, spec.top, spec);
        }

        ctx.restore();

        this.drawVerticalLine(spec, spec.center_x, "當前", data.border_color);
    }

    drawPitchName(pitch, x, y, sm_font, color) {
        if (!pitch) return;
        this.paintText(pitch.inter, x, y, 'center', 'middle', color);
    }

    drawVerticalLine(item, x, text, color) {
        if (!x || !item.hasX(x)) return;
        let ctx = this.ctx;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, item.top);
        ctx.lineTo(x, item.bottom);
        ctx.stroke();
        this.paintText(text, x, item.top + 15, 'center', 'top', color);
    }

    drawHorizontalLine(item, y, pitch, color) {
        if (!y || y < item.top || y > item.bottom) return;
        let ctx = this.ctx;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(item.left, y);
        ctx.lineTo(item.right, y);
        ctx.stroke();
        let x = data.compact ? item.left + 25 : item.left - 10;
        this.paintText(pitch.inter, x, y, 'center', 'middle', color);
    }

    paintText(text, x, y, align = 'center', base_line = 'middle', color = null, size = null) {
        let ctx = this.ctx;
        const originalFont = ctx.font; // Store the original font

        // If a size is provided, create a new font string
        if (size) {
            // Extracts the font family from the original font string
            const fontFamily = originalFont.substring(originalFont.indexOf(' '));
            ctx.font = `${size}px${fontFamily}`;
        }
        
        ctx.fillStyle = color || data.text_color;
        ctx.textAlign = align;
        ctx.textBaseline = base_line;
        ctx.fillText(text, x, y);

        // Restore the original font if it was changed
        if (size) {
            ctx.font = originalFont;
        }
    }
}

var util = {
    getEventLocation: function (e) {
        if (e.touches && e.touches.length == 1) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY }
        } else if (e.clientX && e.clientY) {
            return { x: e.clientX, y: e.clientY }
        }
        return { x: 0, y: 0 };
    }
};

function draw() {
    if (data.view) data.view.draw();
    window.requestAnimationFrame(draw);
}

jQuery(document).ready(function () {
    data.init();
});