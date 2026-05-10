import drawQrcode from 'weapp-qrcode-canvas-2d'

const CORRECT_LEVEL_MAP = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2
}

const CORRECT_LEVEL_HINTS = {
  L: '约7%容错',
  M: '约15%容错',
  Q: '约25%容错',
  H: '约30%容错'
}

Page({
  data: {
    inputText: '',
    codeImage: '',
    errorMsg: '',
    // 配置项
    correctLevel: 'H',
    correctLevelHint: '约30%容错',
    showText: true,
    // 生成历史
    genHistory: []
  },

  onLoad(options) {
    if (options.text) {
      this.setData({ inputText: decodeURIComponent(options.text) })
      setTimeout(() => this.generateCode(), 400)
    }
    this.loadHistory()
  },

  onShow() {
    this.loadHistory()
  },

  // --- 配置操作 ---
  setCorrectLevel(e) {
    const level = e.currentTarget.dataset.level
    this.setData({
      correctLevel: level,
      correctLevelHint: CORRECT_LEVEL_HINTS[level],
      codeImage: '',
      errorMsg: ''
    })
  },

  toggleShowText(e) {
    this.setData({ showText: e.detail.value })
  },

  // --- 输入 ---
  onInput(e) {
    this.setData({ inputText: e.detail.value, errorMsg: '' })
  },

  // --- 生成 ---
  generateCode() {
    const text = this.data.inputText.trim()
    if (!text) {
      this.setData({ errorMsg: '请输入内容' })
      setTimeout(() => this.setData({ errorMsg: '' }), 2000)
      return
    }
    const that = this
    const correctLevel = this.data.correctLevel
    const query = wx.createSelectorQuery()
    query.select('#qrcodeCanvas')
      .fields({ node: true, size: true })
      .exec(async (res) => {
        try {
          if (!res[0]) {
            that.setData({ errorMsg: 'Canvas 获取失败' })
            return
          }
          const canvas = res[0].node

          await drawQrcode({
            canvas: canvas,
            canvasId: 'qrcodeCanvas',
            width: 260,
            padding: 20,
            background: '#ffffff',
            foreground: '#000000',
            text: text,
            correctLevel: CORRECT_LEVEL_MAP[correctLevel]
          })

          wx.canvasToTempFilePath({
            canvas: canvas,
            x: 0,
            y: 0,
            width: 260,
            height: 260,
            destWidth: 780,
            destHeight: 780,
            success(res) {
              that.setData({ codeImage: res.tempFilePath, errorMsg: '' })
            },
            fail() {
              that.setData({ errorMsg: '导出图片失败' })
            }
          })
        } catch (e) {
          that.setData({ errorMsg: e.message || '二维码生成失败' })
          setTimeout(() => that.setData({ errorMsg: '' }), 2000)
        }
      })

    this.saveToHistory(text)
  },

  // --- 历史 ---
  loadHistory() {
    try {
      const genHistory = wx.getStorageSync('qr_gen_history') || []
      this.setData({ genHistory })
    } catch (e) {
      console.error('读取历史失败', e)
    }
  },

  saveToHistory(text) {
    try {
      let genHistory = wx.getStorageSync('qr_gen_history') || []
      const now = new Date()
      const timeStr = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
      genHistory = genHistory.filter(item => item.text !== text)
      genHistory.unshift({ text, time: timeStr })
      if (genHistory.length > 50) genHistory = genHistory.slice(0, 50)
      wx.setStorageSync('qr_gen_history', genHistory)
      this.setData({ genHistory })
    } catch (e) {
      console.error('保存历史失败', e)
    }
  },

  onHistoryItemTap(e) {
    const item = e.currentTarget.dataset.item
    this.setData({ inputText: item.text, codeImage: '', errorMsg: '' })
    setTimeout(() => this.generateCode(), 100)
  },

  clearGenHistory() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有生成历史吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('qr_gen_history')
          this.setData({ genHistory: [] })
          wx.showToast({ title: '已清空', icon: 'success' })
        }
      }
    })
  },

  // --- 操作 ---
  saveImage() {
    if (!this.data.codeImage) return
    wx.saveImageToPhotosAlbum({
      filePath: this.data.codeImage,
      success: () => {
        wx.showToast({ title: '已保存', icon: 'success' })
      },
      fail: (err) => {
        if (err.errMsg.includes('auth deny') || err.errMsg.includes('authorize')) {
          wx.showModal({
            title: '提示',
            content: '需要相册权限才能保存，是否前往设置？',
            success: (res) => {
              if (res.confirm) wx.openSetting()
            }
          })
        }
      }
    })
  },

  copyText() {
    if (!this.data.inputText) return
    wx.setClipboardData({
      data: this.data.inputText,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  },

  shareImage() {
    if (!this.data.codeImage) return
    wx.showShareImageMenu({
      path: this.data.codeImage,
      fail: () => {
        wx.showToast({ title: '分享失败', icon: 'none' })
      }
    })
  }
})
