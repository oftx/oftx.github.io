// 创建AudioContext对象
var audioContext = new (window.AudioContext || window.webkitAudioContext)();
var oscillators = [];
var slider = document.getElementById("hzRange");
var output = document.getElementById("hzValue");
const toggleButton = document.getElementById('theme-toggle');
const body = document.body;
const maxHz = 22050;

const decreaseButton = document.getElementById("decrease");
const increaseButton = document.getElementById("increase");
const hzValueInput = document.getElementById("hzValue");
const hzRangeSlider = document.getElementById("hzRange");

let intervalId; // 记录长按定时器的 ID
let timeoutId; // 记录点击定时器的 ID

// 更新输入框和滑块的值
function updateValue(newValue) {
  if (newValue < 0) {
    newValue = 0;
  } else if (newValue > 22050) {
    newValue = 22050;
  }
  hzValueInput.value = newValue;
  hzRangeSlider.value = newValue;
}

// 点击按钮时的处理函数
function handleDecreaseClick() {
  let currentValue = parseInt(hzValueInput.value) || 0;
  if (currentValue > 0) {
    updateValue(currentValue - 1);
  }
}

function handleIncreaseClick() {
  let currentValue = parseInt(hzValueInput.value) || 0;
  if (currentValue < maxHz) {
    updateValue(currentValue + 1);
  }
}

// 长按按钮时的处理函数
function handleDecreaseHold() {
  let currentValue = parseInt(hzValueInput.value) || 0;
  clearInterval(intervalId); // 先清除之前的定时器
  timeoutId = setTimeout(() => {
    let t = 0; // 初始时间
    intervalId = setInterval(() => {
      if (currentValue - t * t > 0) {
        currentValue = Math.floor(currentValue - t * t);
      } else {
        currentValue = 0;
      }
      updateValue(currentValue);
      t += 0.1; // 每次增加0.1秒
      if (currentValue <= 0) {
        clearInterval(intervalId);
      }
    }, 100); // 定时器每100毫秒执行一次
  }, 150);
}

function handleIncreaseHold() {
  let currentValue = parseInt(hzValueInput.value) || 0;
  clearInterval(intervalId); // 先清除之前的定时器
  timeoutId = setTimeout(() => {
    let t = 0; // 初始时间
    intervalId = setInterval(() => {
      const deltaValue = Math.floor(t * 10); // 计算应该增加的值
      const newValue = Math.min(currentValue + deltaValue, maxHz);
      updateValue(newValue);
      if (newValue < maxHz) { // 判断是否需要继续执行
        t += 0.05; // 增加 t 的值
      } else {
        clearInterval(intervalId); // 停止定时器
      }
    }, 150); // 定时器每150毫秒执行一次
  }, 150);
}

// 松开按钮时的处理函数
function handleDecreaseRelease() {
  clearInterval(intervalId); // 清除定时器
  clearTimeout(timeoutId); // 清除点击定时器
}

function handleIncreaseRelease() {
  clearInterval(intervalId); // 清除定时器
  clearTimeout(timeoutId); // 清除点击定时器
}

// 给按钮添加事件监听器
decreaseButton.addEventListener("click", handleDecreaseClick);
increaseButton.addEventListener("click", handleIncreaseClick);
decreaseButton.addEventListener("mousedown", handleDecreaseHold);
increaseButton.addEventListener("mousedown", handleIncreaseHold);
decreaseButton.addEventListener("touchstart", handleDecreaseHold);
increaseButton.addEventListener("touchstart", handleIncreaseHold);
decreaseButton.addEventListener("mouseup", handleDecreaseRelease);
increaseButton.addEventListener("mouseup", handleIncreaseRelease);
decreaseButton.addEventListener("touchend", handleDecreaseRelease);
increaseButton.addEventListener("touchend", handleIncreaseRelease);

outputLog("在点击“播放”按钮前请检查音量");

output.value = slider.value;

slider.oninput = function () {
  output.value = this.value;
}

output.oninput = function () {
  slider.value = this.value;
}

document.getElementById('hzValue').addEventListener('focus', function () {
  window.scrollTo(0, 0);
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

toggleButton.addEventListener('click', function () {
  body.classList.toggle('light-theme');
});