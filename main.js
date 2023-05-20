// 创建AudioContext对象
var audioContext = new (window.AudioContext || window.webkitAudioContext)();
var oscillators = [];
var slider = document.getElementById("hzRange");
var output = document.getElementById("hzValue");

output.value = slider.value;

slider.oninput = function() {
  output.value = this.value;
}

output.oninput = function() {
  slider.value = this.value;
}

document.getElementById('hzValue').addEventListener('focus', function() {
  window.scrollTo(0,0);
});

function playSound() {
    // 创建OscillatorNode对象，生成声音
    var oscillator = audioContext.createOscillator();
    oscillator.type = 'sine'; // 设置波形类型
    oscillator.frequency.value = document.getElementById("hzRange").value; // 设置频率（440Hz为A音调）
    oscillator.start(); // 开始生成声音

    // 将声音连接到AudioContext输出
    oscillator.connect(audioContext.destination);

    // 将新创建的OscillatorNode对象保存在oscillators数组中
    oscillators.push(oscillator);

    outputLog("声音创建，频率为 " + oscillator.frequency.value + " Hz");
}

function stopSound() {
    for (var i = 0; i < oscillators.length; i++) {
        oscillators[i].stop(); // 停止声音
        oscillators[i].disconnect(); // 断开连接
    }
    oscillators = []; // 清空数组

    outputLog("声音停止\n");
}

function outputLog(text) {
    // 获取输出元素的引用
    var outputElem = document.getElementById('output');

    // 创建文本节点
    var textNode = document.createTextNode(text);

    // 将文本节点添加到输出元素中
    outputElem.appendChild(textNode);
    outputElem.appendChild(document.createElement('br'));
}