// pages/batchbarcode/batchbarcode.js
// 直接使用 Canvas 2D API 绘制 Code 128 条码（与首页 index.js 相同算法）

// Code 128 编码表 - 完整107个模式
const CODE128_PATTERNS = [
  [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],
  [1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],
  [2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],
  [1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2],
  [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2],
  [3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],
  [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],
  [1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],
  [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],
  [1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1],
  [2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],
  [3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],
  [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],
  [1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],
  [1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],
  [2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1],
  [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2],
  [1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],
  [2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],
  [1,1,4,1,1,3],[1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1],
  [1,1,4,1,3,1],[3,1,1,1,4,1],[4,1,1,1,3,1],[2,1,1,4,1,2],[2,1,1,2,1,4],
  [2,1,1,2,3,2],[2,3,3,1,1,1,2]
]

/**
 * 将字符串编码为 Code 128 码字序列
 * @param {string} text - 输入文本（ASCII 32-127）
 * @returns {number[]} 码字数组（含START、数据、校验、STOP）
 */
function stringToCode128(text) {
  const START_B = 104
  const START_C = 105
  const STOP = 106
  const CODE_B = 100

  const bytes = []
  for (let i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i))

  const allDigits = bytes.every(b => b >= 48 && b <= 57)

  const codes = []

  if (allDigits && bytes.length >= 4) {
    codes.push(START_C)
    let i = 0
    while (i < bytes.length) {
      if (bytes.length - i >= 2) {
        codes.push(parseInt(String.fromCharCode(bytes[i]) + String.fromCharCode(bytes[i + 1])))
        i += 2
      } else {
        codes.push(CODE_B)
        codes.push(bytes[i] - 32)
        i++
      }
    }
  } else {
    codes.push(START_B)
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]
      if (b >= 32 && b <= 127) {
        codes.push(b - 32)
      } else {
        codes.push(0)
      }
    }
  }

  let checksum = codes[0]
  for (let i = 1; i < codes.length; i++) {
    checksum += i * codes[i]
  }
  codes.push(checksum % 103)
  codes.push(STOP)

  return codes
}

Page({
  data: {
    inputText: '',
    lineCount: 0,
    results: [],      // [{text, imagePath, error}]
    hasInput: false,
    isGenerating: false,
    errorMsg: '',
    saveProgress: -1,
    previewVisible: false,
    previewImage: '',
    previewText: '',
    previewIndex: 0
  },

  onInput(e) {
    const text = e.detail.value || ''
    const lines = text.split('\n').filter(l => l.trim())
    this.setData({
      inputText: text,
      lineCount: lines.length,
      hasInput: text.length > 0
    })
  },

  pasteFromClipboard() {
    wx.getClipboardData({
      success: (res) => {
        const content = (res.data || '').trim()
        if (!content) {
          wx.showToast({ title: '剪贴板为空', icon: 'none' })
          return
        }
        const current = this.data.inputText
        const newText = current ? current + '\n' + content : content
        const lines = newText.split('\n').filter(l => l.trim())
        this.setData({
          inputText: newText,
          lineCount: lines.length,
          hasInput: true
        })
      }
    })
  },

  clearInput() {
    this.setData({
      inputText: '',
      lineCount: 0,
      hasInput: false,
      results: [],
      errorMsg: ''
    })
  },

  clearResults() {
    this.setData({ results: [] })
  },

  // 核心：批量生成
  generateBatch() {
    const lines = this.data.inputText.split('\n').filter(l => l.trim())
    if (lines.length === 0) {
      this.setData({ errorMsg: '请输入内容' })
      setTimeout(() => this.setData({ errorMsg: '' }), 2000)
      return
    }
    if (lines.length > 50) {
      this.setData({ errorMsg: '最多支持50条' })
      setTimeout(() => this.setData({ errorMsg: '' }), 2000)
      return
    }

    // 检查是否有非ASCII字符
    const invalid = lines.find(l => /[^\x20-\x7E]/.test(l))
    if (invalid) {
      this.setData({ errorMsg: '内容包含不支持的字符（仅支持英文和数字）' })
      setTimeout(() => this.setData({ errorMsg: '' }), 2000)
      return
    }

    this.setData({ isGenerating: true, results: [], errorMsg: '' })
    this._generateOneByOne(lines, 0)
  },

  // 逐条生成
  _generateOneByOne(lines, index) {
    if (index >= lines.length) {
      this.setData({ isGenerating: false })
      wx.showToast({ title: '生成完成', icon: 'success' })
      return
    }

    const text = lines[index].trim()
    this._drawBarcode(text, (imagePath, error) => {
      const results = this.data.results.concat([{ text, imagePath, error }])
      this.setData({ results })
      // 继续下一条
      this._generateOneByOne(lines, index + 1)
    })
  },

  /**
   * 使用 Canvas 2D API 绘制 Code 128 条码
   * 与首页 index.js 的绘制逻辑一致
   */
  _drawBarcode(text, callback) {
    const query = wx.createSelectorQuery().in(this)
    query.select('#batchBarcodeCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          console.error('Canvas 节点未找到:', res)
          callback('', 'Canvas初始化失败')
          return
        }

        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getWindowInfo().pixelRatio || 2

        // 设置 Canvas 实际像素尺寸
        const canvasW = 340
        const canvasH = 140
        canvas.width = canvasW * dpr
        canvas.height = canvasH * dpr
        ctx.scale(dpr, dpr)

        // 白底
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvasW, canvasH)

        // 计算条码
        const codes = stringToCode128(text)
        if (!codes || codes.length === 0) {
          callback('', '编码失败')
          return
        }

        // 计算总模块宽度
        let totalModules = 0
        for (let i = 0; i < codes.length; i++) {
          const pattern = CODE128_PATTERNS[codes[i]]
          if (!pattern) {
            callback('', '编码错误')
            return
          }
          for (let j = 0; j < pattern.length; j++) {
            totalModules += pattern[j]
          }
        }

        const quietZone = 20
        const availWidth = canvasW - quietZone * 2
        const moduleWidth = availWidth / totalModules
        const barHeight = canvasH - 50   // 下方留足空间给文字
        const fontSize = 13
        const textY = canvasH - 12       // 文字更靠下，离条码更远

        ctx.fillStyle = '#000000'

        // 绘制条码条
        let x = quietZone
        for (let i = 0; i < codes.length; i++) {
          const pattern = CODE128_PATTERNS[codes[i]]
          for (let j = 0; j < pattern.length; j++) {
            const w = pattern[j] * moduleWidth
            if (j % 2 === 0) {
              ctx.fillRect(x, 5, w, barHeight)
            }
            x += w
          }
        }

        // 绘制文字
        ctx.font = `${fontSize}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = '#000000'
        ctx.fillText(text, canvasW / 2, textY)

        // 导出图片
        wx.canvasToTempFilePath({
          canvas: canvas,
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
          destWidth: canvas.width,
          destHeight: canvas.height,
          success: (res) => {
            console.log('条码生成成功:', text, res.tempFilePath)
            callback(res.tempFilePath, '')
          },
          fail: (err) => {
            console.error('导出条码图片失败', text, err)
            callback('', '导出图片失败')
          }
        })
      })
  },

  // 点击图片预览
  openPreview(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.results[index]
    if (!item || !item.imagePath) return
    this.setData({
      previewVisible: true,
      previewIndex: index,
      previewImage: item.imagePath,
      previewText: item.text
    })
  },

  // 手势切换：记录触摸起始位置
  onPreviewTouchStart(e) {
    this._touchStartX = e.changedTouches[0].clientX
  },

  // 手势切换：判断左右滑动
  onPreviewTouchEnd(e) {
    const startX = this._touchStartX
    if (!startX) return
    const endX = e.changedTouches[0].clientX
    const diff = endX - startX
    const THRESHOLD = 50 // 滑动阈值(px)

    if (diff > THRESHOLD) {
      // 右滑 → 上一张
      this._goPrev()
    } else if (diff < -THRESHOLD) {
      // 左滑 → 下一张
      this._goNext()
    }
    this._touchStartX = null
  },

  // 切换到上一张
  _goPrev() {
    const { previewIndex, results } = this.data
    if (previewIndex <= 0) return
    const newIndex = previewIndex - 1
    const item = results[newIndex]
    if (item && item.imagePath) {
      this.setData({
        previewIndex: newIndex,
        previewImage: item.imagePath,
        previewText: item.text
      })
    }
  },

  // 切换到下一张
  _goNext() {
    const { previewIndex, results } = this.data
    if (previewIndex >= results.length - 1) return
    const newIndex = previewIndex + 1
    const item = results[newIndex]
    if (item && item.imagePath) {
      this.setData({
        previewIndex: newIndex,
        previewImage: item.imagePath,
        previewText: item.text
      })
    }
  },

  // 关闭预览
  closePreview() {
    this.setData({ previewVisible: false })
  },

  // 保存预览图
  savePreview() {
    const { previewImage } = this.data
    if (!previewImage) return
    wx.saveImageToPhotosAlbum({
      filePath: previewImage,
      success: () => {
        wx.showToast({ title: '已保存', icon: 'success' })
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('deny') !== -1) {
          wx.showToast({ title: '请授权相册权限', icon: 'none' })
        }
      }
    })
  },

  // 更多菜单
  showItemMenu(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.results[index]
    if (!item) return

    wx.showActionSheet({
      itemList: ['保存图片', '复制文本', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this._saveImage(index)
        } else if (res.tapIndex === 1) {
          this._copyText(item.text)
        } else if (res.tapIndex === 2) {
          this._deleteItem(index)
        }
      }
    })
  },

  // 保存图片（内部方法）
  _saveImage(index) {
    const item = this.data.results[index]
    if (!item || !item.imagePath) {
      wx.showToast({ title: '暂无图片', icon: 'none' })
      return
    }
    wx.saveImageToPhotosAlbum({
      filePath: item.imagePath,
      success: () => {
        wx.showToast({ title: '已保存', icon: 'success' })
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('deny') !== -1) {
          wx.showToast({ title: '请授权相册权限', icon: 'none' })
        }
      }
    })
  },

  // 复制文本（内部方法）
  _copyText(text) {
    if (!text) return
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  },

  // 删除单条结果
  _deleteItem(index) {
    const results = this.data.results.concat()
    results.splice(index, 1)
    this.setData({ results })
  },

  // 批量保存所有条码
  saveAllImages() {
    const validResults = this.data.results.filter(r => r.imagePath)
    if (validResults.length === 0) {
      wx.showToast({ title: '暂无图片可保存', icon: 'none' })
      return
    }

    wx.showModal({
      title: '保存全部',
      content: `将保存 ${validResults.length} 张条码图片到相册，是否继续？`,
      success: (res) => {
        if (res.confirm) {
          this._saveBatch(validResults, 0)
        }
      }
    })
  },

  _saveBatch(results, index) {
    if (index >= results.length) {
      this.setData({ saveProgress: -1 })
      wx.showToast({ title: '全部保存完成', icon: 'success' })
      return
    }

    this.setData({ saveProgress: index })
    const item = results[index]

    if (!item.imagePath) {
      this._saveBatch(results, index + 1)
      return
    }

    wx.saveImageToPhotosAlbum({
      filePath: item.imagePath,
      success: () => {
        // 继续下一张
        this._saveBatch(results, index + 1)
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('deny') !== -1) {
          this.setData({ saveProgress: -1 })
          wx.showToast({ title: '请授权相册权限', icon: 'none' })
          return
        }
        // 继续下一张
        this._saveBatch(results, index + 1)
      }
    })
  },

  onShareAppMessage() {
    return {
      title: '批量生成条码 - 游游制码',
      path: '/pages/batchbarcode/batchbarcode'
    }
  },

  onShareTimeline() {
    return {
      title: '批量生成条码 - 游游制码'
    }
  }
})
