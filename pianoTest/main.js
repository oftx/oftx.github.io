const audioContext = new AudioContext();

// let harmonics = [0, 0.75, 0.5, 0, 0.5]; // xianyue
// let amplitudes = [0, 0, 0, 0, 0];

// let harmonics = [1, 2, 2, 0.3, 1]; // bell
// let amplitudes = [0.007, 0.01, 0.003, 0.06, 0.01];

// let harmonics = [1, 0.75, 0.5, 0.25, 0.125];
// let amplitudes = [1, 0.75, 0.5, 0.25, 0.125];

let harmonics = [0.5, 1, 1.5, 2, 2.5]; // piano
let amplitudes = [0.007, 0.01, 0.003, 0.006, 0.01];

function createInputBoxes(containerId, valuesArray, onChange) {
    const container = document.getElementById(containerId);

    for (let i = 0; i < valuesArray.length; i++) {
        const input = document.createElement("input");
        input.type = "number";
        input.step = "0.01";
        input.value = valuesArray[i];
        input.addEventListener("input", (event) => {
            valuesArray[i] = parseFloat(event.target.value);
            onChange();
        });
        container.appendChild(input);
    }
}

function updateArrays() {
    // 这里可以进行相应的操作或处理，以响应数组值的更新
    console.log("谐波频率比例：", harmonics);
    console.log("谐波振幅比例：", amplitudes);
}

createInputBoxes("harmonics-inputs", harmonics, updateArrays);
createInputBoxes("amplitudes-inputs", amplitudes, updateArrays);

function playPianoKey(baseFrequency) {
    const fundamental = baseFrequency; // 基音频率
    const duration = 1; // 声音持续时间为1秒
    const fadeDuration = 0.67; // 淡出时间为0.1秒

    // 创建多个OscillatorNode对象，分别生成不同频率和振幅的波形
    const oscillators = harmonics.map((harmonic, index) => {
        const oscillator = audioContext.createOscillator();
        oscillator.type = "sine"; // 设置波形类型为正弦波
        oscillator.frequency.value = fundamental * harmonic; // 设置频率为谐波频率
        oscillator.start();
        const gainNode = audioContext.createGain();
        gainNode.gain.value = amplitudes[index]; // 设置振幅为谐波振幅
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        return { oscillator, gainNode }; // 返回 oscillator 和 gainNode 对象
    });

    // 延迟一定时间后开始淡出
    setTimeout(() => {
        const fadeStartTime = audioContext.currentTime;
        const fadeEndTime = fadeStartTime + fadeDuration;
        const fadeStartValue = 1; // 初始音量
        const fadeEndValue = 0.01; // 最终音量

        oscillators.forEach(({ gainNode }) => {
            gainNode.gain.setValueAtTime(fadeStartValue, fadeStartTime);
            gainNode.gain.exponentialRampToValueAtTime(fadeEndValue, fadeEndTime);
        });
    }, (duration - fadeDuration) * 1000);


    // 延迟一定时间后停止所有OscillatorNode对象的播放
    setTimeout(() => {
        oscillators.forEach(({ oscillator }) => oscillator.stop());
    }, duration * 1000);
}

