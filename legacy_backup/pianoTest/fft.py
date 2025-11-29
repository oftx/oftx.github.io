import numpy as np
import scipy.io.wavfile as wavfile
import matplotlib.pyplot as plt

# 读取音频文件
sample_rate, audio_data = wavfile.read("audio.wav")

# 执行傅里叶变换
fft_data = np.fft.fft(audio_data)

# 计算频率轴
freq_axis = np.fft.fftfreq(len(audio_data), 1 / sample_rate)

# 绘制频谱图
plt.plot(freq_axis[:len(freq_axis) // 2], np.abs(fft_data[:len(fft_data) // 2]))
plt.xlabel("Frequency (Hz)")
plt.ylabel("Amplitude")
plt.title("Spectrum")
plt.show()
