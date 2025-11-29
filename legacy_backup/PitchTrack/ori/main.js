function MainFunction() {
  var self = this;
  self.main = new Main();
  self.main.init();
}

function enlarge(self) {
  var img = self;
  var url = img.src;
  url = url.replace('_lq/', '/');
  img.src = url;
  var c = 'center-fit';
  if (img.classList.contains(c)) {
    img.classList.remove(c);
  } else {
    img.classList.add(c);
  }
}

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
    ctx.roundRect(this.left, this.top, this.width, this.height, [this.radii]);
    if (this.stroke_color) ctx.stroke();
    if (this.fill_color) ctx.fill();
  }

  click() {

  }
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
    let xx = 0;
    let width = this.getInternalWidth();
    let left = x;
    if (x < parent.left) {
      xx = parent.left - x;
      width -= xx;
      left = parent.left;
    }
    if (left + width > parent.right) {
      width = parent.right - left;
    }

    let yy = 0;
    let height = this.height;
    let top = y;
    if (y < parent.top) {
      yy = parent.top - y;
      height -= yy;
      top = parent.top;
    }
    if (top + height > parent.bottom) {
      height = parent.bottom - top;
    }

    if (this.image) {
      ctx.drawImage(this.image, xx * dpi, yy * dpi, width * dpi, height * dpi,
        left, top, width, height);
      return;
    }

    let self = this;
    function putImage(left, xx, width) {
      if (width <= 0) return;
      ctx.putImageData(self.image_data, (left - xx) * dpi, top * dpi,
        xx * dpi, yy * dpi, width * dpi, height * dpi);
    }

    let x1 = this.xToInternalX(xx);
    let x2 = this.xToInternalX(xx + width);
    if (x2 > x1) {
      putImage(left, x1, x2 - x1);
    } else {
      let w1 = this.width - x1;
      putImage(left, x1, w1);
      putImage(left + w1, 0, width - w1);
    }

  }

  xToInternalX(x) {
    return (x + this.start_x) % this.width;
  }

  getInternalWidth() {
    return (this.end_x + 1 + this.width - this.start_x) % this.width;
  }

}

class AudioItem extends Item {
  constructor(path, name) {
    super([]);
    this.path = path;
    this.vocal_items = [];
    this.history_fft = [];
    this.fft_data = new Uint8Array(data.fft_size);
    this._current_index = 0;
    this.raw_spec_image = null;
    this.panner_value = 0;
    this.is_mic = path == 'mic';
    this.fft_scale = data.fft_scale;
    this.is_instruments = false;
    this.sample_rate = 44100;
    this.name = name || this.path.replace(/^.*[\\/]/, '');
    if (this.is_mic) {
      this.name = '选择文件';
    }
  }

  get current_index() {
    if (this.is_instruments && data.table.base_audio) {
      return data.table.base_audio.current_index;
    }
    return this._current_index;
  }

  set current_index(i) {
    this._current_index = i;
  }

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
      self.processed = true;
      // data.table.onMicStarted();

    }
    const constraints = {
      'video': false,
      'audio': true
    }
    navigator.mediaDevices.getUserMedia(constraints)
      .then(stream => {
        callback(stream);
      })
      .catch(error => {
        console.error('Error accessing media devices.', error);
      });

    // navigator.getUserMedia({ video: false, audio: true }, callback, console.log);
  }

  async loadAndProcess() {
    if (this.is_mic) {
      this.raw_spec_image = new ImageDataWithDpi(5000,
        data.raw_spec_height, data.dpi);
      this.processed = true;
      return;
    }
    let url = this.path;
    const ctx = data.getAudioCtx();
    this.audio_ctx = ctx;
    let response = await fetch(url);
    let raw_data = await response.arrayBuffer();
    const audio_buffer = await ctx.decodeAudioData(raw_data);
    this.audio_buffer = audio_buffer;
    this.sample_rate = audio_buffer.sampleRate;
    let slow = this.fft_scale;
    let duration = Math.min(420, audio_buffer.duration);
    duration *= data.fft_scale;
    let buffer_size = Math.ceil(duration) * this.sample_rate;
    let self = this;
    let table = data.table;

    if (this.is_instruments) {
      this.processed = true;
      return;
    }

    this.raw_spec_image = new ImageDataWithDpi(Math.ceil(buffer_size / data.fft_size),
      data.raw_spec_height, 1);

    const offline_ctx = new OfflineAudioContext(1, buffer_size,
      this.sample_rate);

    response = await fetch(url);
    const offline_audio_buffer = await offline_ctx.decodeAudioData(await response.arrayBuffer());
    this.offline_audio_buffer = offline_audio_buffer;

    let data1 = offline_audio_buffer.getChannelData(0);
    let new_buffer = offline_ctx.createBuffer(1, Math.ceil(duration) * this.sample_rate, this.sample_rate);
    this.new_buffer = new_buffer;
    let data2 = new_buffer.getChannelData(0);

    function copy_chunk(from, to) {
      from = Math.floor(from);
      for (let i = 0; i < data.fft_size; i++) {
        data2[to + i] = data1[from + i];
      }
    }
    let from = 0;
    let to = 0;
    let delta = data.fft_size / slow;
    for (; from < data1.length - data.fft_size; from += data.fft_size) {
      for (let j = 0; j < slow; j++) {
        copy_chunk(from + delta * j, to);
        to += data.fft_size;
      }

    }

    const offline_source = offline_ctx.createBufferSource();
    offline_source.buffer = new_buffer;

    let analyser = new AnalyserNode(offline_ctx, {
      fftSize: data.fft_size,
      maxDecibels: 0,
      minDecibels: -140,
      smoothingTimeConstant: 0.0,
    });
    const bufferLength = analyser.frequencyBinCount;
    this.analyser = analyser;
    offline_source.connect(analyser);

    let processor = offline_ctx.createScriptProcessor(data.fft_size, 1, 1);
    this.processor = processor;
    processor.onaudioprocess = function (e) {
      self.processFft();
    }
    offline_source.onended = function (e) {
      self.finalize();
      analyser.disconnect(processor);
      delete self.analyser;
      delete self.new_buffer;
      delete self.offline_audio_buffer;
      delete self.processor;
      self.processed = true;
      table.onProcessEnd();
    }
    table.onProcessBegin();


    analyser.connect(processor);
    processor.connect(offline_ctx.destination);
    offline_source.start();
    offline_ctx.startRendering();
  }
  process() {
    if (this.getSize() == 0) {
      this.loadAndProcess();
    }
  }

  play(play_sound) {
    this.play_sound = play_sound;
    let time = this.indexToTime(this.current_index);
    let when = 0;
    if (time < 0) {
      when = -time;
      time = 0;
    }

    if (this.is_mic) {
      this.cutCurrent();
      this.startMic();
    } else if (play_sound) {
      let ctx = this.audio_ctx;
      this.source = ctx.createBufferSource();
      this.source.buffer = this.audio_buffer;
      if (this.panner_value != 0) {
        let panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(this.panner_value, ctx.currentTime);
        this.source.connect(panner);
        panner.connect(ctx.destination);
      } else {
        this.source.connect(ctx.destination);
      }
      this.source.start(ctx.currentTime + when, time);
    }
    this.start_time = Date.now();
    this.when = when;
    this.start_index = this.current_index;
  }
  stop() {
    if (this.is_mic) {
      this.closeMic();
    } else if (this.source) {
      this.source.stop();
    }
  }

  closeMic() {
    if (this.is_mic && this.stream) {
      this.stream.getAudioTracks().forEach(function (track) {
        track.stop();
      });
      this.source.disconnect(this.analyser);
      delete this.source;
      delete this.stream;
    }
  }

  finalize() {
    if (this.raw_spec_image)
      this.raw_spec_image.finalize();
    delete this.source;
  }

  updatePlayTime() {
    if (data.is_stopped) {
      if (data.debug) {
        let i = Math.round(this.current_index);
        if (i >= 0 && i < this.history_fft.length) {
          let fft = this.history_fft[i - 1];
          if (fft)
            new VocalItem(this, fft);
        }
      }
      return;
    }
    if (this.is_mic && this.analyser) {
      this.processFft();
    }
    let time = Date.now();
    time -= this.start_time;
    time /= 1000;
    let delta = this.timeToIndex(time);
    this.current_index = this.start_index + delta;
  }

  forward(x) {
    var time = this.timeToIndex(x);
    this.current_index += time;
  }

  getSummary() {
    if (this.is_mic) {
      return '麦克风'
    }
    let str = '';
    if (this == data.table.base_audio) {
      str = '原唱';
    } else {
      str = '翻唱';
    }
    if (!data.compact) {
      str += ' - ' + this.name;
    }
    return str;
  }
  getSize() {
    return this.vocal_items.length;
  }

  getVocalItem(i) {
    i = Math.round(i);
    if (i < 0 || i >= this.getSize()) {
      return null;
    }
    return this.vocal_items[i];
  }

  addVocalItem(vocal_item) {
    let last_i = this.getSize() - 1;
    let previous = this.getVocalItem(last_i);
    if (previous) {
      if (vocal_item.pitch_name) {
        vocal_item.duration = previous.duration + 1;
        if (previous.pitch_name == vocal_item.pitch_name) {
          vocal_item.pitch_duration = previous.pitch_duration + 1;
        }
      } else {
        let duration = previous.duration;
        if (duration < data.min_duration) {
          for (let i = 0; i < duration; i++) {
            let item = this.getVocalItem(last_i - i);
            if (item) {
              item.reset();
            }
          }
        }
      }
    }
    this.vocal_items.push(vocal_item);
  }

  indexToTime(index) {
    return index / this.sample_rate * data.fft_size / this.fft_scale;
  }
  timeToIndex(time) {
    return time * this.sample_rate / data.fft_size * this.fft_scale;
  }

  move(x, y) {
    this.current_index -= x;
  }

  setColors(color, pitch_color, alpha) {
    this.color = new Color(color);
    this.pitch_color = new Color(pitch_color);
    this.alpha = alpha;
  }

  getColor(eng) {
    if (eng < data.fft_min_eng) return null;
    let p = (eng - data.fft_min_eng) / (data.fft_max_eng - data.fft_min_eng);
    if (p > 1) p = 1;
    let color = this.color;
    color.alpha = p;
    return color;
  }

  getFileName() {
    return this.name;
  }

  getPitchPoint(index) {
    index = Math.round(index);
    if (index < 0 || index >= this.getSize()) {
      return 0;
    }
    return this.vocal_items[index].pitch_point;
  }

  getEng(index) {
    index = Math.round(index);
    if (index < 0 || index >= this.getSize()) {
      return 0;
    }
    return this.vocal_items[index].peak_eng / 255;
  }

  cutHalf() {
    let n = this.getSize();
    let new_n = Math.floor(n / 2);
    let x = n - new_n;
    this.vocal_items = this.vocal_items.slice(x);
    if (this.raw_spec_image) {
      this.raw_spec_image.cutHalf(x);
    }
    this.current_index = new_n;
    this.start_time = Date.now();
    this.start_index = this.current_index;
  }

  cutCurrent() {
    let new_n = this.current_index;
    new_n = Math.floor(new_n);
    new_n = Math.max(new_n, 0);
    this.vocal_items = this.vocal_items.slice(0, new_n);
    if (this.history_fft) {
      this.history_fft = this.history_fft.slice(0, new_n);
    }
    if (this.raw_spec_image) {
      this.raw_spec_image.clearAfter(new_n);
    }
  }

  processFft() {
    if (!this.analyser) return;
    this.analyser.getByteFrequencyData(this.fft_data);
    let fft = this.fft_data;

    // let channl = this.channel_data;
    // let raw_data = new Float32Array(data.fft_size);
    // let out1 = new Float32Array(data.fft_size);
    // this.analyser.getFloatFrequencyData(out1);
    // this.analyser.getFloatTimeDomainData(raw_data);
    // const f = new FFT(data.fft_size);
    // const out2 = f.createComplexArray();
    // f.realTransform(out2, raw_data);
    // let out3 = new Float32Array(data.fft_size);
    // for ( let i = 0; i < data.fft_size; i++) {
    //   let a = out2[i*2];
    //   let b = out2[i*2+1];
    //   out3[i] = Math.sqrt(a*a + b*b);
    // }

    // let windowFunc = new WindowFunction(DSP.HANN, 0);
    // let raw1=windowFunc.process(raw_data);
    // var fft = new RFFT(data.fft_size, 48000);
    //   fft.forward(raw1);
    // var spectrum = fft.spectrum;
    // for ( let i = 0; i < data.fft_size; i++) {
    //   spectrum[i] = 20* Math.log10(spectrum[i]*1);
    // }


    let target = this.getSize() + 1;
    if (this.is_mic) {
      target = this.current_index;
    }
    let previous_x = this.getSize() - 1;
    let previous_pitch_point = this.getPitchPoint(previous_x);

    for (let x = this.vocal_items.length; x < target; x++) {
      let vocal_item = new VocalItem(this, fft);
      this.addVocalItem(vocal_item);
      if (data.debug) {
        this.history_fft.push([...fft]);
      }


      // Fill raw spec.
      let image = this.raw_spec_image;
      let height = image.height;
      let pitch_index = -1;
      if (vocal_item) {
        let pitch_freq = vocal_item.pitch_freq;
        pitch_index = Math.round(pitch_freq / this.sample_rate * data.fft_size);
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

    this.current_index = this.getSize();
    if (this.is_mic && this.getSize() >= 2400) {
      this.cutHalf();
    }
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
    this.points = new Float32Array(2000);
    this.total_eng = 0;
    this.start = 0;
    this.audio_item = audio_item;
    this.level_count = 0;
    this.min_point = this.points.length;
    this.max_point = 0;
    this.max_eng = 0;
    this.peek_eng = 0;
    this.reset();

    this.guessPitch();
  }

  pitchToPoint(pitch_name) {
    let pitch = data.table.getPitch(pitch_name);
    return data.table.spec_item.freqToAbsoluteY(pitch.freq);
  }

  reset() {
    this.pitch_point = 0;
    this.min_point = 0;
    this.max_point = 0;
    this.pitch_freq = 0;
    this.pitch_name = null;
    this.pitch_duration = 0;
    this.duration = 0;
  }

  hasPitch() {
    return this.pitch_point > 0;
  }

  getDurationText() {
    let str = this.pitch_name;
    if (this.pitch_duration > 10) {
      let time = this.audio_item.indexToTime(this.pitch_duration);
      str = util.formatTime(time) + str;
    }
    str += ' ' + this.getRealText();
    return str;
  }
  getRealText() {
    let base = this.base_eng;
    let total = this.max_value;
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

  guessPitch() {
    let fft = this.fft;
    let table = data.table;
    let level_n = VocalItem.level_n;
    let point_n = this.points.length;
    this.min_point = point_n;
    let calculate_values = [];

    if (VocalItem.fft_map.length == 0) {
      VocalItem.start_point = Math.round(this.pitchToPoint('C2'));
      VocalItem.end_point = Math.round(this.pitchToPoint('C8'));
      for (let i = VocalItem.start_point; i < VocalItem.end_point; i++) {
        let arr = [];
        let freq = data.table.spec_item.absoluteYtoFreq(i);
        for (let level = 1; level < level_n; level++) {
          if (freq * level > 7000) break;
          let index = this.freqToIndex(freq * level);
          index = Math.round(index);
          arr.push(index);
        }
        VocalItem.fft_map.push(arr);
      }
    }

    let is_tops = this.isTop(fft);
    if (data.debug) {
      data.debug_fft = fft;
      data.debug_is_tops = is_tops;
    }
    if (this.peak_eng < 150) {
      return;
    }


    let max_value = 0;
    let pitch_point = 0;
    let end_point = VocalItem.end_point;
    let highest_point = this.indexToPoint(this.highest_index) + VocalItem.vocal_range + 3;
    end_point = Math.min(end_point, highest_point);
    let last_value = -1;
    for (let i = VocalItem.start_point; i < end_point; i++) {
      let map = VocalItem.fft_map[i - VocalItem.start_point];
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
      calculate_values[i] = calculate_value;
      if (calculate_value > max_value) {
        max_value = calculate_value;
        pitch_point = i;
        this.base_eng = base_eng;
        data.debug_log = `${map},`
      }
    }

    this.max_value = max_value;
    this.pitch_point = pitch_point;
    if (pitch_point > 0) {
      this.min_point = Math.max(0, this.pitch_point - VocalItem.vocal_range);
      this.max_point = this.pitch_point + VocalItem.vocal_range;
      this.pitch_freq = table.spec_item.absoluteYtoFreq(this.pitch_point);
      this.pitch_name = table.getPitchForFreq(this.pitch_freq).inter;
    }

    let vocal_eng = 0;
    for (let i = this.min_point; i <= this.max_point; i++) {
      vocal_eng += calculate_values[i];
    }
    let weight = pitch_point > 1900 ? 300 : 30;
    if (vocal_eng < this.total_eng / weight) {
      this.reset();
    }
  }

  isTop(fft) {
    this.total_eng = 0;
    let highest_index = 0;
    let highest_eng = 0;
    for (let i = 9; i < fft.length - 2; ++i) {
      let value = fft[i];
      this.total_eng += value;
      if (value > highest_eng) {
        highest_index = i;
        highest_eng = value;
      }
    }
    data.debug_log = `${highest_index}`;

    let n = data.fft_n;
    let all_eng = 0;
    let is_tops = new Int8Array(n);

    function isTop(index, delta) {
      if (fft[index] < highest_eng - 70) return false;
      for (let i of [1, 2]) {
        let j = index + delta * i;
        if (j < 0 || j >= n) break;
        if (fft[j] > fft[index]) return false;
        if (fft[j] < fft[index]) return true;
      }
      return false;
    }
    function hasLower(index, delta) {
      let eng = fft[index] - 30;
      for (let i = 1; i < VocalItem.vocal_range; i++) {
        let j = index + i * delta;
        if (j < 0) break;
        if (fft[j] < eng) return true;
      }
      return false;
    }

    function avgEng(from, to) {
      if (from < 0) {
        from = 0;
      }
      let total = 0;
      for (let i = from; i <= to; i++) {
        total += fft[i];
      }
      return total / (to - from + 1);
    }

    function highThanAvg(index) {
      let eng = fft[index];
      let avg_eng = avgEng(index - VocalItem.vocal_range, index + VocalItem.vocal_range);
      return eng > avg_eng + 10;
    }


    for (let i = 0; i < fft.length; i++) {
      all_eng += fft[i];
    }
    for (let i = 1; i < n; i++) {
      let b = false;
      if (isTop(i, 1) && isTop(i, -1) && hasLower(i, 1) && hasLower(i, -1) && highThanAvg(i)) {
        for (let j = i - VocalItem.top_range; j <= i + VocalItem.top_range; j++) {
          is_tops[j] = true;
        }
        let value = fft[i];

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

  addEngValue(eng, point, level) {
    if (eng <= 0) return;
    this.map[level][point] = Math.max(eng, this.map[level][point]);
    this.min_point = Math.min(this.min_point, point);
  }

  addEng(eng, index, level) {
    this.peek_eng = Math.max(this.peek_eng, eng);
    this.total_eng += eng / (level - this.level_count + 1);
    let min_point = this.indexToPoint(index / level);
    let max_point = this.indexToPoint((index + 1) / level);
    let total = max_point - min_point;
    total = Math.min(1, total);
    for (let i = Math.floor(min_point); i < Math.ceil(max_point); i++) {
      let value = 1;
      if (i < min_point) {
        value = Math.ceil(min_point) - min_point;
      } else if (i > max_point - 1) {
        value = max_point - Math.floor(max_point);
      }
      value = eng;// * value / total;
      this.addEngValue(value, i, level);
    }
  }
}

class SpecItem extends Item {
  constructor() {
    super([]);
    let table = data.table;
    let min_pitch = table.getPitch(data.spec_min_pitch);
    let max_pitch = table.getPitch(data.spec_max_pitch);
    this.min_y = min_pitch.freq;
    this.max_y = max_pitch.freq;
    this.height = data.spec_points_per_key * (max_pitch.index - min_pitch.index);
    this.y_range = this.log(this.max_y) - this.log(this.min_y);
    this.min_absolute_y = this.freqToAbsoluteY(this.min_y);
    this.range_min_y = Math.floor(this.freqToAbsoluteY(table.pitches[0].freq));
    this.range_max_y = Math.floor(this.freqToAbsoluteY(table.pitches[table.pitches.length - 1].freq));
    this.stroke_color = data.border_color;
    this.delta_y = 0;
  }

  log(freq) {
    let a = Math.log(freq);
    return a;
  }

  freqToAbsoluteY(freq) {
    let p = this.log(freq) / this.y_range;
    return p * this.height;
  }

  freqToY(freq) {
    let absolute_y = this.freqToAbsoluteY(freq);
    return this.absoluteYtoY(absolute_y);
  }

  absoluteYtoY(yy) {
    return this.bottom - (yy - this.min_absolute_y) - this.delta_y;
  }

  yToLogFreq(y) {
    y = this.bottom - y;
    y -= this.delta_y;
    y += this.min_absolute_y;
    return y / this.height * this.y_range;
  }
  absoluteYtoFreq(y) {
    return Math.pow(Math.E, y / this.height * this.y_range);
  }

  move(x, y) {
    this.delta_y -= y;
    if (this.min_y - this.delta_y + this.min_absolute_y < this.range_min_y) {
      this.delta_y = this.min_y - this.range_min_y + this.min_absolute_y;
    }
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
  static EMPTY = 0;
  static MATCH = 1;
  static OFF = 2;
  static MISS = 3;
  constructor() {
    this.match_rate = 0;
    this.current_match_index = 0;
    this.match_count = 0;
    this.total_count = 0;
    this.match_data = [];
    this.buttons = [];
    this.state = '';
    this.process_count = 0;
  }

  reload() {
    this.reloadPitches();
    this.piano = new Item([]);
    this.spec_item = new SpecItem();
    this.raw_spec_item = new RawSpecItem();

    // this.play_label = new ButtonItem('播放:');
    // this.play_base_button = new ButtonItem('原唱');
    // this.play_vocal_button = new ButtonItem('翻唱');
    // this.play_instruments_button = new ButtonItem('伴奏');

    // this.show_label = new ButtonItem('     显示:');
    // this.show_base_button = new ButtonItem('原唱');
    // this.show_vocal_button = new ButtonItem('翻唱');

    // this.play_label.setClickable(false);
    // this.play_base_button.color = data.base_audio_color;
    // this.play_base_button.setOn(true);
    // this.play_vocal_button.color = data.vocal_audio_color;
    // this.play_vocal_button.setOn(true);
    // this.play_instruments_button.setOn(true);

    // this.show_label.setClickable(false);
    // this.show_base_button.color = data.base_audio_color;
    // this.show_base_button.setOn(true);
    // this.show_vocal_button.color = data.vocal_audio_color;
    // this.show_vocal_button.setOn(true);

    if (data.debug_preload) {
      this.setAudio('base_audio', '/wp-content/uploads/2024/03/黑色毛衣_原唱.mp3');
      this.setAudio('vocal_audio', '/wp-content/uploads/2024/04/黑色毛衣_翻唱.mp3');
      this.setAudio('instruments_audio', '/wp-content/uploads/2024/03/黑色毛衣_伴奏.mp3');
    }

    data.controller.showSettings();
  }

  reloadPitches() {
    let pitch_data = data.pitch_data;
    if (!pitch_data) return;
    this.pitches = [];
    this.pitch_map = {};
    this.white_pitches = [];
    this.dark_pitches = [];
    for (let key in pitch_data) {
      let json = pitch_data[key];
      let pitch = new Pitch(json);
      this.pitches.push(pitch);
      this.pitch_map[pitch.inter] = pitch;
      if (pitch.is_white) {
        this.white_pitches.push(pitch);
      } else {
        this.dark_pitches.push(pitch);
      }
    }

    let major = data.pitch_display_mode;
    if (major == 'inter') {
      major = 'C4';
    } else {
      var ii = 4;
      if (data.man_note) {
        ii--;
      }
      // if (major in ['Ab', 'B']) {
      //   ii--;
      // }
      major += `${ii}`;
    }
    let major_pitch = this.getPitch(major);
    if (!major_pitch) {
      major_pitch = this.getPitch('C4');
    }
    let index = major_pitch.index;
    let deltas = [0, 2, 4, 5, 7, 9, 11];
    for (let level of [0, 1, 2, 3, 4, -1, -2, -3, -4]) {
      for (let i = 0; i < deltas.length; i++) {
        let delta = deltas[i];
        let j = index + 12 * level + delta;
        if (j < 0 || j >= this.pitches.length) {
          continue;
        }
        this.pitches[j].setSimpleName(i + 1, level);
      }
    }
    data.cache_piano_image = null;

  }

  calculateAll() {

  }

  getSummary() {
    let str = '';
    if (data.debug) {
      str += data.debug_log;
    }
    if (this.process_count) {
      return str + '导入中...';
    }
    if (this.state) {
      return str + this.state;
    }
    if (this.base_audio && this.vocal_audio &&
      this.base_audio.sample_rate != this.vocal_audio.sample_rate) {
      return '采样率不匹配，无法比较';
    }
    if (this.hasMatch() && this.match_data.length > 0) {
      let index = this.current_match_index;
      let total = data.is_stopped ? this.total_count : this.total_count_data[index];
      let match = data.is_stopped ? this.match_count : this.match_count_data[index];
      let rate = total > 0 ? match / total : 0;

      return str + `匹配率:${util.formatPercent(rate)} (${match}/${total})`;
    }
    return '';
  }

  hasMatch() {
    return this.base_audio && this.vocal_audio && !this.vocal_audio.is_mic;
  }

  forward(x) {
    if (this.base_audio) this.base_audio.forward(x);
    if (this.vocal_audio) this.vocal_audio.forward(x);
    if (!data.is_stopped) {
      data.table.stop();
      data.table.play();
    }
  }

  autoMatch() {
    if (this.base_audio) this.base_audio.current_index = 0;
    if (this.vocal_audio) this.vocal_audio.current_index = 0;
    if (!this.hasMatch()) return;
    this.state = '自动对齐中...';
    let a1 = this.base_audio;
    let a2 = this.vocal_audio;
    let n = a1.getSize();
    let range = Math.round(n / 3);
    let max_match = 0;
    let max_index = 0;
    for (let i = -range; i < range; i++) {
      a2.current_index = a1.current_index + i;
      let match = this.calculateMatch();
      if (match > max_match) {
        max_match = match;
        max_index = i;
      }
    }
    a2.current_index = a1.current_index + max_index;
    this.calculateMatch();
    this.state = '';
  }

  calculateMatch() {
    if (!this.hasMatch()) return;
    let match_count = 0;
    let total_count = 0;
    let a1 = this.base_audio;
    let a2 = this.vocal_audio;
    this.match_data = new Int8Array(a1.getSize());
    this.match_count_data = new Int16Array(a1.getSize());
    this.total_count_data = new Int16Array(a1.getSize());
    let audio_delta = a2.current_index - a1.current_index;
    for (let i = 0; i < a1.getSize() & i < a2.getSize(); i++) {
      let pitch1 = a1.getPitchPoint(i);
      let pitch2 = a2.getPitchPoint(i + audio_delta);
      if (pitch1 <= 0) {
        this.match_data[i] = Table.EMPTY;
      } else {
        total_count++;
        if (pitch2 <= 0) {
          this.match_data[i] = Table.MISS;
        } else if (Math.abs(pitch1 - pitch2) < data.match_min_delta) {
          match_count++;
          this.match_data[i] = Table.MATCH;
        } else {
          this.match_data[i] = Table.OFF;
        }
      }
      this.match_count_data[i] = match_count;
      this.total_count_data[i] = total_count;
    }
    this.match_count = match_count;
    this.total_count = total_count;
    this.match_rate = match_count / total_count;
    return this.match_rate;
  }

  move(x, y) {
    this.spec_item.move(x, y);
    console.log()
    let only_vocal = data.adjust_vocal_audio || data.shift_key;

    for (let audio_item of this.getAudios()) {
      if (only_vocal && audio_item != this.vocal_audio) continue;
      audio_item.move(x, y);
    }
    if (only_vocal) {
      this.calculateMatch();
    }
  }

  getSampleRate() {
    let rate = 44100;
    for (let audio_item of this.getAudios()) {
      rate = audio_item.sample_rate;
      break;
    }
    return rate;
  }

  processAudios() {
    if (this.base_audio) this.base_audio.process();
    if (this.vocal_audio) this.vocal_audio.process();
    if (this.instruments_audio) this.instruments_audio.process();
    this.updatePlay(false);
  }

  onProcessBegin() {
    this.process_count++;
  }

  onProcessEnd() {
    this.process_count--;
    this.updatePlay(true);
  }

  updatePlay(auto_match) {
    if (this.process_count == 0) {
      for (let audio_item of this.getAudios()) {
        if (!audio_item.processed) {
          return;
        }
      }
      if (this.vocal_audio && this.vocal_audio.is_mic) {
        // this.vocal_audio.startMic();
      }
      if (auto_match) {
        this.autoMatch();
      }
      this.play();
    }
  }

  onMicStarted() {
    this.autoMatch();
    if (!this.base_audio) {
      this.play();
    }
  }

  play() {
    let play_base = true;
    let play_vocal = true;
    let play_instruments = true;
    let base_pan = 0;
    let vocal_pan = 0;
    if (data.play_audios == 'base_audio') {
      play_vocal = false;
    } else if (data.play_audios == 'vocal_audio') {
      play_base = false;
    } else {
      if (this.base_audio && this.vocal_audio && !this.vocal_audio.is_mic) {
        base_pan = -0.8;
        vocal_pan = 0.8;
      }
    }
    if (this.base_audio) {
      this.base_audio.panner_value = base_pan;
      this.base_audio.play(play_base);
    }
    if (this.vocal_audio) {
      this.vocal_audio.panner_value = vocal_pan;
      this.vocal_audio.play(play_vocal);
    }
    if (this.instruments_audio) {
      this.instruments_audio.play(play_instruments);
    }
    data.is_stopped = false;
    data.controller.generateControls();
  }

  stop() {
    if (data.is_stopped) return;
    data.is_stopped = true;
    for (let audio of this.getAudios()) {
      audio.stop();
    }
    data.controller.generateControls();

  }

  updatePlayTime() {
    for (let audio of this.getAudios()) {
      audio.updatePlayTime();
    }

  }

  getPitch(name) {
    return this.pitch_map[name];
  }

  getPitchForFreq(freq) {
    let log_freq = Math.log(freq);
    return this.getPitchForLogFreq(log_freq);
  }
  getPitchForLogFreq(log_freq) {
    let min_delta = 1000;
    let hover_pitch = null;
    for (let pitch of this.pitches) {
      let delta = Math.abs(pitch.log_freq - log_freq);
      if (delta < min_delta) {
        min_delta = delta;
        hover_pitch = pitch;
      }
    }
    return hover_pitch;
  }

  getAudios() {
    return [this.base_audio, this.vocal_audio, this.instruments_audio].filter(Boolean);
  }
  getLastAudio() {
    if (this.vocal_audio && this.vocal_audio.play_sound) {
      return this.vocal_audio;
    }
    if (this.base_audio && this.base_audio.play_sound) {
      return this.base_audio;
    }
  }
  getShowAudios() {
    let audios = [];
    if (this.base_audio &&
      (data.show_audios == 'base_audio' || data.show_audios == 'all_audio')) {
      audios.push(this.base_audio);
    }
    if (this.vocal_audio &&
      (data.show_audios == 'vocal_audio' || data.show_audios == 'all_audio')) {
      audios.push(this.vocal_audio);
    }
    return audios;
  }
  getFirstAudio() {
    return this.base_audio || this.vocal_audio;
  }

  setAudio(key, path, name) {
    let audio_item = new AudioItem(path, name);
    if (key == 'base_audio') {
      audio_item.setColors(data.base_audio_color, data.base_audio_pitch_color);
    } else {
      audio_item.setColors(data.vocal_audio_color, data.vocal_audio_pitch_color);
    }
    if (key == 'instruments_audio') {
      audio_item.is_instruments = true;
    }
    this[key] = audio_item;
  }

  getHoverPitch(x, y) {
    for (let pitch of this.dark_pitches) {
      if (pitch.hasPos(x, y)) {
        return pitch;
      }
    }
    for (let pitch of this.white_pitches) {
      if (pitch.hasPos(x, y)) {
        return pitch;
      }
    }
    return null;
  }

  onHover(x, y) {
    data.hover_x = x;
    let hover_pitch = null;
    if (this.piano.hasPos(x, y)) {
      hover_pitch = this.getHoverPitch(x, y);
    } else if (!data.show_raw_spec && this.spec_item.hasPos(x, y)) {
      let freq = this.spec_item.yToLogFreq(y);
      hover_pitch = this.getPitchForLogFreq(freq);
    } else if (data.show_raw_spec && this.raw_spec_item.hasPos(x, y)) {
      let freq = this.raw_spec_item.yToFreq(y);
      hover_pitch = this.getPitchForFreq(freq);
    }
    data.hover_pitch = hover_pitch;
  }

  onClick(x, y) {
    let hover_pitch = null;
    if (this.piano.hasPos(x, y)) {
      for (let button of this.dark_pitches) {
        if (button.hasPos(x, y)) {
          button.onClick();
          return;
        }
      }
      for (let button of this.white_pitches) {
        if (button.hasPos(x, y)) {
          button.onClick();
          return;
        }
      }
    } else {
      for (let button of this.buttons) {
        if (button.hasPos(x, y)) {
          button.onClick();
          return;
        }
      }
    }
  }


  update() {
  }
}


class Controller {
  constructor(container_id) {
    this.container_id = container_id;
  }
  generateControls() {
    let self = this;
    let container = document.getElementById(this.container_id);
    container.innerHTML  = "";
    this.container = container;
    this.current_line = container;
    let div = null;
    let button = null;

    button = this.createCheckbox('show_raw_spec', '原始数据');
    button.onchange = function () {
      data.setTag('show_raw_spec', this.checked);
      self.updateSettings();
    }

    div = this.createLine();
    div.classList.add('toggle-radio');
    this.createToggleButton('男低', 'piano_range', 'E2');
    this.createToggleButton('男高', 'piano_range', 'C3');
    this.createToggleButton('女低', 'piano_range', 'F3');
    this.createToggleButton('女高', 'piano_range', 'C4');
    this.current_line = container;

    if (!data.compact) {
      div = this.createLine();
      div.classList.add('toggle-radio');
      this.createToggleButton('原唱', 'play_audios', 'base_audio');
      this.createToggleButton('翻唱', 'play_audios', 'vocal_audio');
      this.createToggleButton('全部', 'play_audios', 'all_audio');
      this.current_line = container;
    }


    this.current_line = container;
    button = this.createButton('设置');
    button.onclick = function () {
      data.table.stop();
      self.showSettings();
    }

  }
  showSettings() {
    this.updateSettings();

    data.dialog.onclose = function () {
      data.table.processAudios();
    };

    data.dialog.showModal();
  }
  updateSettings() {
    let self = this;
    let dialog = data.dialog;

    let songs = {
      '不选': '',
      '三十岁的女人': '/wp-content/uploads/2024/04/三十岁的女人',
      '分手快乐': '/wp-content/uploads/2024/04/分手快乐',
      '黑色毛衣': '/wp-content/uploads/2024/03/黑色毛衣',
      '当你': '/wp-content/uploads/2024/04/当你',
      '爱的魔法': '/wp-content/uploads/2024/04/爱的魔法',
      '倒带': '/wp-content/uploads/2024/04/倒带',
      '独家记忆': '/wp-content/uploads/2024/04/独家记忆',
      '孤勇者': '/wp-content/uploads/2024/04/孤勇者',
      '来自天堂的魔鬼': '/wp-content/uploads/2024/04/来自天堂的魔鬼',
      '梦醒了': '/wp-content/uploads/2024/04/梦醒了',
      '山海': '/wp-content/uploads/2024/04/山海',
      '陀飞轮': '/wp-content/uploads/2024/04/陀飞轮',
      '我好想你': '/wp-content/uploads/2024/04/我好想你',
      '夜空中最亮的星': '/wp-content/uploads/2024/04/夜空中最亮的星',
      '追梦赤子心': '/wp-content/uploads/2024/04/追梦赤子心',
      '走马': '/wp-content/uploads/2024/04/走马',
    };
    let pitch_display_modes = {
      '国际谱': 'inter',
    }
    for (let pitch of data.table.pitches.slice(0, 12)) {
      let name = pitch.inter.slice(0, -1);
      pitch_display_modes[`${name}大调`] = name;
    }

    dialog.innerHTML = '';
    let table = document.createElement('table');
    table.classList.add('settings');
    dialog.appendChild(table);
    let tbody = document.createElement('tbody');
    table.appendChild(tbody);
    this.container = tbody;
    table = data.table;
    let button = null;
    let level = data.level;

    this.tr();
    let td = this.td();
    td.colSpan = '2';
    td.innerHTML = '<h2><a target="_blank" href="https://bideyuanli.com/p/5488">' +
      'APP测音高已发布！</a></h2><b>在线测音高2.0</b> ｜ <a target="_blank" href="https://bideyuanli.com/p/5414">' +
      '使用说明</a> ｜ <a target="_blank" href="https://bideyuanli.com/ppv1">' +
      '1.0老版</a><br>只想测音高的请点击';
    button = this.createButton('使用麦克风');
    button.classList.add('close_button');
    button.onclick = function () {
      table.setAudio('vocal_audio', 'mic');
      dialog.close();
    };
    this.createLabel('或');

    this.tr();
    this.td();
    this.td();
    this.tr();
    this.td();
    this.createLabel('翻唱音源（纯人声）：');
    this.td();
    this.createFileInput('vocal_audio');

    this.tr();
    this.td();
    this.createLabel('原唱音源（纯人声）:');
    this.td();
    this.createFileInput('base_audio');
    this.tr();
    this.td();
    this.createLabel('伴奏:');
    this.td();
    this.createFileInput('instruments_audio');
    this.tr();
    this.td();
    this.createLabel('选择内置原唱：');
    this.td();
    button = this.createList(songs);
    button.value = data.pre_select_song;
    button.onchange = function (e) {
      let value = this.value;
      data.pre_select_song = value;
      if (value) {
        table.setAudio('base_audio', value + '_原唱.mp3');
        table.setAudio('instruments_audio', value + '_伴奏.mp3');
        self.updateSettings();
      }
    }

    this.tr();
    this.td();
    this.createLabel('音高显示模式：');
    this.td();
    button = this.createList(pitch_display_modes);
    button.value = data.pitch_display_mode;
    button.onchange = function (e) {
      let value = this.value;
      data.setTag('pitch_display_mode', value);
      data.table.reloadPitches();
      self.updateSettings();
    }

    if (data.pitch_display_mode != 'inter') {
      this.tr();
      this.td();
      this.createLabel('是男人么：');
      this.td();
      button = this.createCheckbox('man_note', '男唱谱（低八度）');
      button.onchange = function () {
        data.setTag('man_note', this.checked);
        data.table.reloadPitches();
        self.updateSettings();
      }
    }
    this.tr();
    td = this.td();
    td.colSpan = '2';
    button = this.createButton('开始');
    button.classList.add('close_button');
    button.disabled = !table.base_audio && !table.vocal_audio;
    button.onclick = function () {
      dialog.close();
    };


  }
  createLabel(text) {
    let button = document.createElement("label");
    button.innerHTML = text;
    this.current_line.appendChild(button);
    return button;
  }
  createButton(text) {
    let button = document.createElement("button");
    button.innerHTML = text;
    this.current_line.appendChild(button);
    return button;
  }
  createToggleButton(text, key, value) {
    let button = document.createElement("input");
    button.type = 'radio';
    button.name = key;
    button.id = key + value;
    button.value = value;
    button.checked = data[key] == value;
    button.onclick = function () {
      data.setTag(key, value);
      if (key == 'play_audios') {
        if (!data.is_stopped) {
          data.table.stop();
          data.table.play();
        } else {
          let table = data.table;
          if (table.base_audio) {
            table.base_audio.play_sound = value == 'base_audio'
              || value == 'all_audio';
          }
          if (table.vocal_audio) {
            table.vocal_audio.play_sound = value == 'vocal_audio'
              || value == 'all_audio';
          }

        }
      }
    }
    this.current_line.appendChild(button);
    let label = this.createLabel(text);
    label.classList.add(value);
    label.htmlFor = button.id;
    return button;
  }
  createList(options) {
    let button = document.createElement("select");
    for (let name in options) {
      var option = document.createElement("option");
      option.value = options[name];
      option.text = name;
      button.appendChild(option);
    }
    this.current_line.appendChild(button);
    return button;
  }

  createFileInput(key) {
    let self = this;
    let button = document.createElement('button');

    let audio = data.table[key];
    if (audio) {
      button.innerHTML = audio.getFileName();
    } else {
      button.innerHTML = '选择文件';
    }
    button.onclick = _ => {
      let button = document.createElement('input');
      button.type = 'file';
      button.onchange = _ => {
        var path = URL.createObjectURL(button.files[0]);
        data.table.setAudio(key, path, button.files[0].name);
        self.updateSettings();
      };
      button.click();
    }
    this.current_line.appendChild(button);

    return button;
  }

  createCheckbox(key, text) {
    let self = this;
    let button = document.createElement("input");
    button.type = 'checkbox';
    button.id = key;
    var value = data[key];
    button.checked = value;
    this.current_line.appendChild(button);

    let label = this.createLabel(text);
    label.htmlFor = key;
    return button;
  }
  // createSlider(key, text) {
  //   let self = this;
  //   this.td();
  //   this.createLabel(text);
  //   this.td();
  //   let button = document.createElement("input");
  //   button.type = 'range';
  //   if (key == 'level') {
  //     button.min = 1;
  //     button.max = 3;
  //   } else {
  //     button.min = 0;
  //     button.max = 100;
  //   }
  //   var value = data[key];
  //   button.value = value;
  //   button.onchange = function () {
  //     let value = parseInt(button.value);
  //     data.setTag(key, value);
  //     if (key == 'play_bgm') {
  //       data.table.updateBgm();
  //     }
  //     self.generateControls();
  //   }
  //   this.current_line.appendChild(button);
  //   return button;
  // }
  createLine() {
    let div = document.createElement("div");
    this.current_line = div;
    this.container.appendChild(div);
    return div;
  }
  createBr() {
    let div = document.createElement("br");
    this.current_line.appendChild(div);
  }
  tr() {
    let element = document.createElement("tr");
    this.container.appendChild(element);
    this.tr_element = element;
  }
  td() {
    let element = document.createElement("td");
    this.tr_element.appendChild(element);
    this.current_line = element;
    return element;
  }


  update() {
    data.table.update();
  }
  reload() {
    let self = this;
    let view = data.view;
    let table = data.table;
    let ctx = view.ctx;
    let dpi = data.dpi;
    let parent = document.getElementById('main_container');
    var rect = parent.getBoundingClientRect();
    let width = rect.width - 0;
    let height = 1200;
    data.compact = window.innerWidth < 700;

    table.reload();
    this.update();
    this.generateControls();

    let row_count = table.row_count;
    height += view.top + view.bottom;
    ctx.canvas.width = width * dpi;
    ctx.canvas.height = height * dpi;
    ctx.canvas.style.width = width + 'px';
    ctx.canvas.style.height = height + 'px';
    ctx.setTransform(dpi, 0, 0, dpi, 0, 0);

    view.setPos(0, 0, width, height);
    data.view.draw();
    this.generateControls();
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
    value = 255 - value;
    value *= this.a;
    value = Math.min(value, 255);
    return 255 - value;
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
    this.is_white = this.inter.length == 2;
    this.fill_color = this.is_white ? data.piano_white_color : data.piano_dark_color;
    this.text_color = data.border_color;
    if (data.compact || data.pitch_display_mode != 'inter') {
      this.text_color = !this.is_white ? data.piano_white_color : data.piano_dark_color;

    }
    this.log_freq = Math.log(this.freq);
    if (!this.is_white) {
      this.inter = this.inter.substring(4);
    }
  }

  setSimpleName(name, level) {
    this.simple = `${name}`;
    this.level = level;
    if (data.pitch_display_mode == 'inter') {
      this.display_on_piano = !data.compact && name == 1;
    } else {
      if (level == 0 || name == 1) {
        this.display_on_piano = true;
      }
    }
    this.display_on_spec = true;
  }

  getDisplayName() {
    if (data.pitch_display_mode == 'inter') {
      return this.inter;
    }
    return this.simple || this.inter;
  }

  draw() {
    super.draw();
  }

  onClick() {
    new Audio('/wp-content/uploads/2014/03/' + this.inter + '.mp3').play();
  }
}

class View {
  constructor(ctx) {
    this.ctx = ctx;
    this.top = 10;
    this.left = data.compact ? 5 : 40;
    this.right = data.compact ? 5 : 40;
    this.bottom = 30;
    this.table = new Table();
    data.table = this.table;
    this.initMouse();
  }

  initMouse() {
    let self = this;
    var canvas = document.getElementById('canvas');

    let is_dragging_spec = false;
    let is_dragging_raw_spec = false;
    let drag_start = {
      x: 0,
      y: 0
    }
    let drag_middle = drag_start;
    let is_stopped = false;


    function onPointerDown(e) {
      is_stopped = data.is_stopped;
      let pos = util.getEventLocation(e);
      var rect = canvas.getBoundingClientRect();
      let x = pos.x - rect.left;
      let y = pos.y - rect.top;

      is_dragging_spec = data.table.spec_item.hasPos(x, y);
      is_dragging_raw_spec = data.table.raw_spec_item.hasPos(x, y);
      if (is_dragging_spec || is_dragging_raw_spec) {
        data.click_x = x;
        drag_start = pos;
        drag_middle = pos;
        data.table.stop();
        e.preventDefault();
      } else {
        data.table.onClick(x, y);
      }
    }

    function onPointerUp(e) {
      data.table.calculateMatch();
      if (is_stopped && (is_dragging_spec || is_dragging_raw_spec)) {
        if (Math.abs(drag_start.x - drag_middle.x) +
          Math.abs(drag_start.y - drag_middle.y) < 5) {
          data.table.play();
        }
      }
      is_dragging_spec = false;
      is_dragging_raw_spec = false;
    }

    function onPointerMove(e) {
      let pos = util.getEventLocation(e);
      data.shift_key = e.shiftKey;
      let x = pos.x;
      let y = pos.y;
      var rect = canvas.getBoundingClientRect();
      x -= rect.left;
      y -= rect.top;
      data.table.onHover(x, y);

      if (is_dragging_spec || is_dragging_raw_spec) {
        let dy = 0;
        if (is_dragging_spec) {
          dy = pos.y - drag_middle.y;
        }
        data.table.move(pos.x - drag_middle.x, dy);
        drag_middle = pos;
        e.preventDefault();
      }
    }

    function handleTouch(e, singleTouchHandler) {
      if (e.touches.length <= 1) {
        singleTouchHandler(e)
      } else if (e.type == "touchmove" && e.touches.length == 2) {
        is_dragging_spec = false
        handlePinch(e)
      }
    }

    let initialPinchDistance = null
    let lastZoom = self.camera_zoom

    function handlePinch(e) {
      e.preventDefault()

      let touch1 = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      }
      let touch2 = {
        x: e.touches[1].clientX,
        y: e.touches[1].clientY
      }

      // This is distance squared, but no need for an expensive sqrt as it's only used in ratio
      let currentDistance = (touch1.x - touch2.x) ** 2 + (touch1.y - touch2.y) ** 2

      if (initialPinchDistance == null) {
        initialPinchDistance = currentDistance
      } else {
        adjustZoom(null, currentDistance / initialPinchDistance)
      }
    }

    function adjustZoom(zoomAmount, zoomFactor) {
      if (!is_dragging_spec) {
        if (zoomAmount) {
          self.camera_zoom += zoomAmount
        } else if (zoomFactor) {
          self.camera_zoom = zoomFactor * lastZoom
        }

        self.camera_zoom = Math.min(self.camera_zoom, MAX_ZOOM)
        self.camera_zoom = Math.max(self.camera_zoom, MIN_ZOOM)

        return true;
      }
    }

    function onWheel(e) {
      adjustZoom(-e.deltaY * SCROLL_SENSITIVITY);
      e.preventDefault();
    }

    function isTouchDevice() {
      return (('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (navigator.msMaxTouchPoints > 0));
    }

    if (isTouchDevice()) {
      canvas.addEventListener('touchstart', (e) => handleTouch(e, onPointerDown));
      canvas.addEventListener('touchend', (e) => handleTouch(e, onPointerUp));
      canvas.addEventListener('touchmove', (e) => handleTouch(e, onPointerMove));
    } else {
      canvas.addEventListener('mousedown', onPointerDown)
      canvas.addEventListener('mouseup', onPointerUp)
      canvas.addEventListener('mousemove', onPointerMove)
      document.addEventListener('keydown', function (event) {
        if (event.code == 'ArrowLeft') {
          data.table.forward(-3);
        } else if (event.code == 'ArrowRight') {
          data.table.forward(3);
        } else if (event.code == 'Space') {
          if (data.is_stopped) {
            data.table.play();
          } else {
            data.table.stop();
          }
          event.preventDefault();
        }
      });
      // canvas.addEventListener('wheel', (e) => onWheel(e))
    }
  }

  setPos(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.rx = this.x + this.left;
    this.ry = this.y + this.top;
    this.rwidth = this.width - this.left - this.right;
    this.rheight = this.height - this.top - this.bottom;
  }


  getX(x_percent) {
    return this.rwidth * x_percent;
  }

  getY(y_percent) {
    return this.rheight * (1 - y_percent);
  }
  draw() {
    let self = this;
    var table = data.table;
    if (!table.pitches || !table.piano) return;
    var ctx = this.ctx;
    ctx.font = data.font;
    ctx.fillStyle = data.background_color;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);


    ctx.save();
    // ctx.translate(width / 2, height / 2)
    // ctx.scale(self.camera_zoom, self.camera_zoom)
    // ctx.translate(-width / 2 + self.camera_offset.x, -height / 2 + self.camera_offset.y)
    // ctx.translate(this.rx, this.ry);
    let matrix = ctx.getTransform();
    this.matrix = matrix.invertSelf();
    ctx.strokeStyle = data.line_color;
    ctx.lineWidth = 1;

    // this.drawLabels();
    // this.drawLines();

    table.updatePlayTime();

    this.x = this.rx;
    this.y = this.ry;
    this.drawPiano();

    this.x = this.rx;
    this.drawSpec();

    this.drawRawSpec();
    // this.drawBar();

    this.drawDebug();

    ctx.restore();
  }

  drawPitchName(pitch, x, y, sm_font, color) {
    let ctx = this.ctx;
    let a = ctx.globalAlpha;
    let simple = data.pitch_display_mode != 'inter';
    let level = pitch.level;
    if (simple && data.compact) {
      y += level * 2;
    }
    ctx.globalAlpha = 1;
    this.paintText(pitch.getDisplayName(), x, y, 'center', 'middle', color);
    if (sm_font) {
      y += 2;
    }
    if (simple) {
      let sign = Math.sign(level);
      ctx.fillStyle = color;
      let padding = sm_font ? 2 : 4;
      for (let i = 1; i <= Math.abs(level); ++i) {
        ctx.beginPath();
        ctx.arc(x, y - 1 - sign * (padding + 4 * i), 1, 0, Math.PI * 2, true);
        ctx.fill();
      }
    }
    ctx.globalAlpha = a;
  }

  drawPiano() {
    var table = data.table;
    var ctx = this.ctx;
    let self = this;

    let n = table.white_pitches.length;
    let width = this.width - this.x * 2;
    let height = width / 10;
    let white_width = width / n;
    let dark_width = white_width * 0.65;
    let dark_height = height * 0.65;

    ctx.save();

    let x = this.x;
    let y = this.y;
    let piano = table.piano;
    piano.left = x;
    piano.top = y;
    piano.width = width;
    piano.height = height;
    let white_bottom = data.compact ? 8 : 15;


    if (data.cache_piano_image) {
      ctx.putImageData(data.cache_piano_image, piano.left, piano.top);
    } else {

      // ctx.shadowBlur = 50;
      // ctx.shadowColor = data.border_color;
      // ctx.fillRect(x, y, width, height);
      // ctx.shadowBlur = 0;

      ctx.font = data.compact ? data.sm_font : data.font;
      for (let pitch of table.pitches) {
        if (pitch.is_white) {
          pitch.left = x;
          pitch.top = y;
          pitch.width = white_width;
          pitch.height = height;
          pitch.draw();

          if (pitch.display_on_piano) {
            this.drawPitchName(pitch, pitch.center_x,
              pitch.bottom - white_bottom, data.compact, pitch.text_color);
          }

          x += white_width;
        }
      }
      let last_white_pitch = null;
      for (let pitch of table.pitches) {
        if (!pitch.is_white) {
          pitch.left = last_white_pitch.right - dark_width / 2;
          pitch.top = y;
          pitch.width = dark_width;
          pitch.height = dark_height;
          pitch.draw();
          if (pitch.display_on_piano) {
            this.drawPitchName(pitch, pitch.center_x, pitch.center_y, data.compact, pitch.text_color);
          }
        } else {
          last_white_pitch = pitch;
        }
      }
      let image = ctx.getImageData(piano.left, piano.top,
        piano.right * data.dpi, piano.bottom * data.dpi);
      data.cache_piano_image = image;
    }

    {

      let pitch = table.getPitch(data.piano_range);
      ctx.fillStyle = data.border_color;
      ctx.globalAlpha = 0.2;
      ctx.fillRect(pitch.left, pitch.top, pitch.width * 14, pitch.height);
    }


    function drawPitch(pitch, color) {
      if (!pitch) return;
      ctx.fillStyle = color;
      ctx.fillRect(pitch.left, pitch.top, pitch.width, pitch.height);
      y = pitch.is_white ? pitch.bottom - white_bottom : pitch.center_y;
      self.drawPitchName(pitch, pitch.center_x, y, data.compact, pitch.text_color);

    }

    ctx.font = data.compact ? data.sm_font : data.font;
    ctx.globalAlpha = 0.4;
    drawPitch(data.hover_pitch, data.hover_color);
    ctx.globalAlpha = 0.9;
    let audio_item = table.getLastAudio();
    if (audio_item) {
      let vocal_item = audio_item.getCurrentVocalItem();
      if (vocal_item) {
        drawPitch(table.getPitch(vocal_item.pitch_name), audio_item.color.hex);
      }
    }
    ctx.globalAlpha = 1;

    this.y += height + 5;
    ctx.restore();
  }

  drawButtons() {
    let self = this;
    var table = data.table;
    var ctx = this.ctx;

    ctx.save();

    let x = this.x;
    let y = this.y - 13;

    for (let button of table.buttons) {
      button.left = x;
      button.top = y;
      button.draw();
      x = button.right + data.button_padding;
    }

    ctx.restore();
    this.y += 10;
  }

  static spec_text_top = 5;
  static spec_text_height = 20;

  drawSpec() {
    if (data.show_raw_spec) return;
    let self = this;
    var table = data.table;
    var ctx = this.ctx;

    let width = this.width - this.x * 2;
    let height = width / 2;

    ctx.save();

    let x = this.x;
    let y = this.y;
    let spec = table.spec_item;
    spec.left = x;
    spec.top = y;
    spec.width = width;
    spec.draw();

    ctx.globalAlpha = 0.4;
    for (let pitch of table.pitches) {
      y = spec.freqToY(pitch.freq);
      if (spec.hasY(y) && (pitch.display_on_spec || pitch == data.hover_pitch)) {
        let color = data.line_color;
        if (pitch == data.hover_pitch) {
          color = data.hover_color;
        }
        this.drawHorizontalLine(spec, y, pitch, color);
      }
    }

    function drawVerticalLine(x, color) {
      let audio_item = data.table.getFirstAudio();
      if (!audio_item) return;
      let index = audio_item.current_index - (spec.center_x - x);
      let time = audio_item.indexToTime(index);
      if (isNaN(time) || time < 0) {
        time = 0;
      }
      self.drawVerticalLine(spec, x, util.formatTime(time), color);
    }

    if (!data.compact) {
      drawVerticalLine(data.hover_x, data.line_color);
    }
    drawVerticalLine(spec.center_x, data.border_color);

    {
      let pitch = table.getPitch(data.piano_range);
      let y1 = spec.freqToY(pitch.freq);
      let y2 = y1 - data.spec_points_per_key * 24;
      y2 = Math.max(y2, spec.top);
      y1 = Math.min(y1, spec.bottom);
      ctx.fillStyle = data.border_color;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(spec.left, y2, spec.width, y1 - y2);
    }

    ctx.globalAlpha = 1.0;
    for (let audio_item of table.getShowAudios()) {
      let x_start = spec.center_x - audio_item.current_index;
      ctx.strokeStyle = audio_item.color.hex;
      ctx.fillStyle = audio_item.pitch_color.str;
      let path = null;
      let previous_pitch_y = 0;
      if (!audio_item.play_sound) {
        ctx.globalAlpha /= 2;
      }
      for (x = Math.max(x_start, spec.left); x < spec.right; x++) {
        let i = x - x_start;
        let vocal_item = audio_item.getVocalItem(i);
        let pitch_y = 0;
        if (vocal_item) {
          let pitch_point = vocal_item.pitch_point;
          if (pitch_point > 0) {
            pitch_y = spec.absoluteYtoY(pitch_point);
            if (!spec.hasY(pitch_y)) {
              pitch_y = 0;
            }
          }
        }

        let is_center = !data.is_stopped && Math.floor(i - audio_item.current_index) == 0;

        let connect = !is_center && pitch_y > 0 && previous_pitch_y > 0 &&
          Math.abs(pitch_y - previous_pitch_y) < 100;
        if (path) {
          if (connect) {
            path.lineTo(x, pitch_y);
          } else {
            ctx.stroke(path);
            path = null;
          }
        }
        if (!path && pitch_y > 0) {
          path = new Path2D();
          path.moveTo(x, pitch_y);
          // ctx.fillRect(x, pitch_y, 1, 1);
        }


        if (is_center) {
          ctx.globalAlpha /= 2;
        }
        previous_pitch_y = pitch_y;
      }
      if (path) {
        ctx.stroke(path);
      }
      ctx.globalAlpha = 0.8;
    }
    ctx.globalAlpha = 1;


    if (table.hasMatch()) {
      let last_value = 0;
      let count = 0;
      let right = data.is_stopped ? spec.right : spec.center_x;
      let index = 0;
      for (let x = spec.left; x < right; x++) {
        index = x - spec.center_x + table.base_audio.current_index;
        if (index < 0) continue;
        index = Math.floor(index);
        if (index >= table.match_data.length) break;
        let value = table.match_data[index];
        if (value == last_value) {
          count++;
          if (value > Table.MATCH && count == data.match_min_count) {
            let pitch_point = table.base_audio.getPitchPoint(index);
            let yy = spec.absoluteYtoY(pitch_point) - 30;
            if (spec.hasY(yy)) {
              let text = value == Table.MISS ? '错过！' : '跑调';
              let color = value == Table.MISS ? data.match_miss_color : data.match_off_color;

              this.paintText(text, x, yy, 'center', 'middle', color);
              x += 20;
            }
          }
        } else {
          last_value = value;
          count = 0;
        }
      }
      table.current_match_index = Math.floor(table.base_audio.current_index);

    }

    let last_audio = table.getLastAudio();
    if (last_audio) {
      ctx.globalAlpha = 1.0;
      let audio_item = last_audio;
      let vocal_item = audio_item.getCurrentVocalItem();
      if (vocal_item && vocal_item.pitch_point > 0) {
        let x = spec.center_x;
        let y = spec.absoluteYtoY(vocal_item.pitch_point);
        if (spec.hasY(y)) {

          let r = 8 * audio_item.getEng(audio_item.current_index);

          ctx.fillStyle = audio_item.pitch_color.str;
          ctx.beginPath();
          ctx.arc(spec.center_x, y, r, 0, Math.PI * 2);
          ctx.fill();
          let text = vocal_item.getDurationText();
          ctx.font = data.big_font;
          this.paintText(text, spec.center_x + 15, y, 'left', 'middle', audio_item.pitch_color.str);
          ctx.font = data.font;
        }
      }
    }



    let text = '检测音高';
    if (data.pitch_display_mode == 'inter') {
      text += ' - 国际谱'
    } else {
      text += ' - ' + data.pitch_display_mode + '大调';
      if (data.man_note) {
        text += '(男)';
      }
    }
    if (data.is_stopped) {
      text += ' - 已暂停';
    }
    x = spec.left + 20;
    y = spec.top + View.spec_text_top;
    this.paintText(text, x, y, 'left', 'top', data.border_color);
    y += View.spec_text_height;
    this.paintText('bideyuanli.com', x, y, 'left', 'top', data.border_color);

    x = spec.right - View.spec_text_top;
    y = spec.top + View.spec_text_top;
    for (let audio_item of table.getShowAudios()) {
      this.paintText(audio_item.getSummary(), x, y, 'right', 'top', audio_item.color.hex);
      y += View.spec_text_height;
    }
    this.paintText(table.getSummary(), x, y, 'right', 'top', data.border_color);

    ctx.restore();
    this.y = spec.bottom + 30;
  }

  drawVerticalLine(item, x, text, color) {
    if (!x || !item.hasX(x)) return;
    let ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, item.top);
    ctx.lineTo(x, item.bottom);
    ctx.stroke();
    this.paintText(text, x, item.bottom + 10, 'center', 'top', color);
  }
  drawHorizontalLine(item, y, pitch, color) {
    if (!y || y < 0) return;
    let ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(item.left, y);
    ctx.lineTo(item.right, y);
    ctx.stroke();
    let x = data.compact ? item.left + 10 : item.left - 15;
    if (typeof pitch === "string") {
      this.paintText(pitch, item.left, y, data.compact ? 'left' : 'center');
      return;
    }
    this.drawPitchName(pitch, x, y, false, color);
    if (data.pitch_display_mode != 'inter' && pitch == data.hover_pitch) {
      x = data.compact ? item.right - 10 : item.right + 15;
      this.paintText(pitch.inter, x, y, 'center', 'middle', color);
    }
  }

  drawRawSpec() {
    if (!data.show_raw_spec) return;
    let self = this;
    var table = data.table;
    var ctx = this.ctx;

    let width = this.width - this.x * 2;

    ctx.save();

    let x = this.x;
    let y = this.y;
    let spec = table.raw_spec_item;
    spec.left = x;
    spec.top = y;
    spec.width = width;
    spec.draw();

    ctx.globalAlpha = 1;
    for (let audio_item of table.getShowAudios()) {
      let image = audio_item.raw_spec_image;
      if (image && audio_item.play_sound) {
        let x_start = spec.center_x - audio_item.current_index;
        image.draw(x_start, spec.top, spec);
        ctx.globalAlpha = 0.7;
      }
    }

    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = data.line_color;
    let sample_rate = table.getSampleRate();
    for (let freq of [2000, 4000]) {
      y = spec.freqToY(freq);
      this.drawHorizontalLine(spec, y, freq + 'Hz', data.line_color);
    }
    if (sample_rate) {
      if (data.hover_pitch) {
        y = spec.freqToY(data.hover_pitch.freq);
        this.drawHorizontalLine(spec, y, data.hover_pitch, data.hover_color);
      }
    }

    let text = '原始数据 - bideyuanli.com'
    this.paintText(text, spec.left + 20, spec.top + 5,
      'left', 'top', data.border_color);

    function drawVerticalLine(x, color) {
      let audio_item = data.table.getFirstAudio();
      if (!audio_item) return;
      let index = audio_item.current_index - (spec.center_x - x);
      let time = audio_item.indexToTime(index);
      if (isNaN(time) || time < 0) {
        time = 0;
      }
      self.drawVerticalLine(spec, x, util.formatTime(time), color);
    }
    if (!data.compact) {
      drawVerticalLine(data.hover_x, data.line_color);
    }
    drawVerticalLine(spec.center_x, data.border_color);

    ctx.restore();
    this.y = spec.bottom + 20;
  }

  drawDebug() {
    if (!data.debug) return;
    var table = data.table;

    let audios = table.getShowAudios();
    if (!data.debug_fft || !data.debug_is_tops) return;

    let x = this.rx;
    let y = this.y;
    for (let i = 7; i < 200; i++) {
      let text = `${i},  ${data.debug_fft[i]},  ${data.debug_is_tops[i]}`;
      this.paintText(text, x, y, 'left');
      y += 15;
    }
  }

  paintText(text, x, y, align = 'center', base_line = 'middle', color = null) {
    let ctx = this.ctx;
    let a = ctx.globalAlpha;
    if (color == null) {
      color = data.text_color;
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = base_line;
    ctx.fillText(text, x, y);
    ctx.globalAlpha = a;
  }
}


function draw() {
  data.view.draw();
  window.requestAnimationFrame(draw);
}


class Main {
  constructor() {
    let canvas = document.getElementById("canvas");
    let ctx = canvas.getContext('2d');
    ctx.font = data.font;
    data.ctx = ctx;
    let view = new View(ctx);
    data.view = view;
    this.controller = new Controller('main_control');
    data.controller = this.controller;
    data.table = new Table();


    window.requestAnimationFrame(draw);
  }

  init() {
    let self = this;
    window.onresize = function () {
      if (!data.compact) {
        data.table.stop();
        self.controller.reload();
      }
    }
    this.controller.reload();
  }

}


var util = {
  formatTime: function (time) {
    var str = '';
    var min = Math.floor(time / 60);
    var sec = time - min * 60;
    if (min >= 1) {
      str += `${min}分`;
      if (sec < 10) {
        str += '0';
      }
    }
    str += `${sec.toFixed(1)}秒`;
    return str;
  },
  formatPercent: function (p) {
    p = `${(p * 100).toFixed(1)}`;
    return p + '%';

  },
  shuffle: function (array) {
    let currentIndex = array.length,
      randomIndex;

    // While there remain elements to shuffle.
    while (currentIndex > 0) {

      // Pick a remaining element.
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;

      // And swap it with the current element.
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex], array[currentIndex]
      ];
    }

    return array;
  },
  getEventLocation: function (e) {
    if (e.touches && e.touches.length == 1) {
      return {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      }
    } else if (e.clientX && e.clientY) {
      return {
        x: e.clientX,
        y: e.clientY
      }
    }
    return { x: 0, y: 0 };
  }
};


var PIXEL_RATIO = (function () {
  var ctx = document.createElement("canvas").getContext("2d"),
    dpr = window.devicePixelRatio || 1,
    bsr = ctx.webkitBackingStorePixelRatio ||
      ctx.mozBackingStorePixelRatio ||
      ctx.msBackingStorePixelRatio ||
      ctx.oBackingStorePixelRatio ||
      ctx.backingStorePixelRatio || 1;

  return dpr / bsr;
})();

var data = {
  count: 2,
  dpi: PIXEL_RATIO,
  icon_size: 12,
  data_name: 'pitch',
  locale: 'cn',
  compact: false,
  url_args: [],
  type: '',
  table: null,
  title: '在线测音高2.0',
  vertical: false,
  enlarge: false,
  start_time: null,
  version: 'bai',

  height: 2000,
  item_padding: 2,
  font: '12px Arial',
  sm_font: '8px Arial',
  big_font: '30px Arial bold',

  saved_keys: [
    'pitch_display_mode',
    'man_note',
    'show_raw_spec',
    'piano_range',
  ],

  click_pos: { x: 0, y: 0 },
  tags: [],

  image_scale: 1,
  button_padding: 5,

  fft_size: 4096,
  fft_n: 600,
  fft_scale: 4,
  fft_min_eng: 0.3,
  fft_max_eng: 0.8,

  pitch_display_mode: 'inter',
  man_note: false,
  spec_min_pitch: 'F2',
  spec_max_pitch: 'E5',
  spec_points_per_key: 15,
  show_raw_spec: false,
  raw_spec_height: 500,
  piano_range: 'C3',

  // controls.
  show_audios: 'all_audio',
  play_audios: 'all_audio',
  is_stopped: true,

  debug: false,
  debug_preload: false,
  debug_log: '',

  min_duration: 4,
  match_min_count: 7,
  match_min_delta: 10,

  background_color: '#000',
  text_color: '#FFF',
  line_color: '#aaa',
  border_color: '#039BE5',
  hover_color: '#039BE5',
  piano_white_color: '#FFFFFF',
  piano_dark_color: '#000000',
  base_audio_color: '#F44336',
  base_audio_pitch_color: '#FFCDD2',
  vocal_audio_color: '#FFEB3B',
  vocal_audio_pitch_color: '#DCEDC8',
  match_miss_color: '#BA68C8',
  match_off_color: '#81C784',



  init: function () {
    if (this.inited) return;

    // load from local.
    for (let i = 0; i < localStorage.length; i++) {
      let key = localStorage.key(i);
      let value = localStorage.getItem(key);
      if (this.saved_keys.includes(key)) {
        if (key == 'man_note' || key == 'show_raw_spec') {
          value = value == 'true';
        }
        this[key] = value;
      }
    }
    data.compact = window.innerWidth < 700;

    var prmstr = decodeURIComponent(window.location.search.substr(1));
    if (prmstr != null && prmstr !== "") {

      var params = {};
      var prmarr = prmstr.split("&");
      for (var i = 0; i < prmarr.length; i++) {
        var tmparr = prmarr[i].split("=");
        let name = tmparr[0];
        if (name == 'd4_class') {
          name = 'char';
        }
        this.setValue(name, tmparr[1]);
        this.url_args.push(name);
      }
    }


    this.loadJson();

    let container = document.getElementById('main_container');
    this.main_container = container;

    let dialog = document.getElementById('dialog');
    this.dialog = dialog;
    dialog.onclick = function (e) {
      if (data.item) {
        data.table.closeDialog();
      }
    }

    this.inited = true;
  },

  setValue: function (name, value) {
    name = name.toLowerCase();
    if (value == 'false') {
      value = false
    } else if (jQuery.isNumeric(value)) {
      value = Number(value);
    }
    this[name] = value;
  },

  getName: function (name, attr = 'cn') {
    if (name === "" || name === "name") return "";
    if (this.name_cn.hasOwnProperty(name)) {
      let value = this.name_cn[name][attr];
      if (!value) return '';
      return value.toString();
    }
    return name;
  },

  getValueFromArg(arg_name, default_value) {
    arg_name = arg_name.toLowerCase();
    if (this[arg_name]) {
      return this[arg_name];
    }
    return default_value;
  },


  loadJson: function () {
    var self = this;
    jQuery.when(
      jQuery.getJSON(`/wp-content/themes/pv15/pitch.json`, function (data) {
        for (var attr in data) {
          self[attr] = data[attr];
        }
      })).then(function () {
        self.loadArgs();
        new MainFunction();
      });
  },

  loadArgs: function () {
    let args = this.args;
    if (!args) return;
    let arg_index = this.getValueFromArg('arg', 'default');
    for (let name in args) {
      let arg = args[name];
      if (!this.url_args.includes(name)) {
        this.setValue(name, arg[arg_index]);
      }
    }
  },

  updateUrl: function (map) {
    const url = new URL(window.location);
    for (let key in map) {
      var value = map[key];
      if (!value) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, map[key]);
      }
    }
    window.history.replaceState({}, "", url);
  },

  formatTime(time) {
    let padZero = (v, n = 2) => `${v}`.padStart(n, "0");
    let toTime = v =>
      `${Math.floor(v / 60000)}:${padZero(Math.floor((v % 60000) / 1000))}:${padZero(Math.floor(v % 1000), 3)}`;
    return toTime(time);
  },

  getTime() {
    let time = 0;
    if (data.start_time) {
      if (data.end_time) {
        time = data.end_time - data.start_time;
      } else {
        time = performance.now() - data.start_time;
      }
    }
    return this.formatTime(time);
  },

  setTag(key, b) {
    this[key] = b;
    if (data.saved_keys.includes(key)) {
      localStorage.setItem(key, b);
    }
  },

  getAudioCtx() {
    if (!this.audio_ctx) {
      this.audio_ctx = new AudioContext();
    }
    return this.audio_ctx;
  }

};

jQuery(document).ready(function (jQuery) {
  data.init();
});