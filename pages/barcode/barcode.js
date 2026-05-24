// pages/barcode/barcode.js
import drawQrcode from 'weapp-qrcode-canvas-2d'
import wxbarcode from 'wxbarcode'

Page({
  data: {
    codeType: 'qrcode',
    inputText: '',
    codeImage: '',
    errorMsg: '',
    genHistory: []
  },

  onLoad(options) {
    if (options.type) {
      this.setData({ codeType: options.type })
    }
    if (options.text) {
      this.setData({ inputText: decodeURIComponent(options.text) })
      setTimeout(() => this.generateCode(), 400)
    }
    this.loadHistory()
  },

  onShow() {
    this.loadHistory()
  },

  loadHistory() {
    try {
      const genHistory = wx.getStorageSync('gen_history') || []
      this.setData({ genHistory })
    } catch (e) {
      console.error('读取生成历史失败', e)
    }
  },

  saveToHistory(text, type) {
    try {
      let genHistory = wx.getStorageSync('gen_history') || []
      const now = new Date()
      const timeStr = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
      // 去重：如果相同内容已存在则移到最前
      genHistory = genHistory.filter(item => !(item.text === text && item.type === type))
      genHistory.unshift({
        text,
        type,
        typeLabel: type === 'qrcode' ? '二维码' : '条形码',
        time: timeStr
      })
      if (genHistory.length > 50) genHistory = genHistory.slice(0, 50)
      wx.setStorageSync('gen_history', genHistory)
      this.setData({ genHistory })
    } catch (e) {
      console.error('保存生成历史失败', e)
    }
  },

  switchType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ codeType: type, codeImage: '', errorMsg: '' })
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value, errorMsg: '' })
  },

  generateCode() {
    const { inputText, codeType } = this.data
    if (!inputText.trim()) {
      this.setData({ errorMsg: '请输入内容' })
      setTimeout(() => this.setData({ errorMsg: '' }), 2000)
      return
    }
    if (codeType === 'qrcode') {
      this.generateQRCode(inputText)
    } else {
      this.generateBarCode(inputText)
    }
    this.saveToHistory(inputText.trim(), codeType)
  },

  generateQRCode(text) {
    const that = this
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
  },

  generateBarCode(text) {
    try {
      const that = this
      wxbarcode.barcode('barcodeCanvas', text, 680, 200)

      setTimeout(() => {
        wx.canvasToTempFilePath({
          canvasId: 'barcodeCanvas',
          success(res) {
            that.setData({ codeImage: res.tempFilePath, errorMsg: '' })
          },
          fail() {
            that.setData({ errorMsg: '导出图片失败' })
          }
        })
      }, 500)
    } catch (e) {
      this.setData({ errorMsg: e.message || '条形码生成失败' })
      setTimeout(() => this.setData({ errorMsg: '' }), 2000)
    }
  },

  // 点击历史项 - 填入输入框并生成
  onHistoryItemTap(e) {
    const item = e.currentTarget.dataset.item
    this.setData({
      inputText: item.text,
      codeType: item.type,
      codeImage: '',
      errorMsg: ''
    })
    setTimeout(() => this.generateCode(), 100)
  },

  // 清空生成历史
  clearGenHistory() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有生成历史吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('gen_history')
          this.setData({ genHistory: [] })
          wx.showToast({ title: '已清空', icon: 'success' })
        }
      }
    })
  },

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

  onShareAppMessage() {
    return {
      title: '条码生成工具 - 游游制码',
      path: '/pages/barcode/barcode'
    }
  },

  onShareTimeline() {
    return {
      title: '条码生成工具 - 游游制码'
    }
  }
})
