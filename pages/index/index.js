Page({
  data: {
    inputText: '',
    isDrugTrace: false,
    drugIdCode: '',
    drugSerialNo: '',
    recentHistory: []
  },

  onLoad() {
    this.loadHistory()
  },

  onShow() {
    this.loadHistory()
  },

  loadHistory() {
    try {
      const history = wx.getStorageSync('scan_history') || []
      // 只展示最近5条
      this.setData({ recentHistory: history.slice(0, 5) })
    } catch (e) {
      console.error('读取历史失败', e)
    }
  },

  onInputChange(e) {
    const text = e.detail.value
    const info = this.parseDrugTrace(text.trim())
    this.setData({
      inputText: text,
      ...info
    })
  },

  // 识别药品追溯码
  parseDrugTrace(text) {
    // 8或9开头的20位纯数字
    if (/^[89]\d{19}$/.test(text)) {
      return {
        isDrugTrace: true,
        drugIdCode: text.substring(0, 7),
        drugSerialNo: text.substring(7)
      }
    }
    return {
      isDrugTrace: false,
      drugIdCode: '',
      drugSerialNo: ''
    }
  },

  quickQR() {
    const text = this.data.inputText.trim()
    if (!text) {
      wx.showToast({ title: '请输入内容', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/barcode/barcode?type=qrcode&text=${encodeURIComponent(text)}`
    })
  },

  quickBar() {
    const text = this.data.inputText.trim()
    if (!text) {
      wx.showToast({ title: '请输入内容', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/barcode/barcode?type=barcode&text=${encodeURIComponent(text)}`
    })
  },

  quickGenerate() {
    this.quickQR()
  },

  goToQRCode() {
    wx.navigateTo({ url: '/pages/barcode/barcode?type=qrcode' })
  },

  goToBarcode() {
    wx.navigateTo({ url: '/pages/barcode/barcode?type=barcode' })
  },

  goToScan() {
    wx.navigateTo({ url: '/pages/scan/scan' })
  },

  // 点击历史项 - 复制内容
  onHistoryItemTap(e) {
    const value = e.currentTarget.dataset.value
    wx.setClipboardData({
      data: value,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  },

  // 查看全部历史
  viewAllHistory() {
    wx.navigateTo({ url: '/pages/scan/scan?action=history' })
  },

  // 清空历史
  clearHistory() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有扫码历史吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('scan_history')
          this.setData({ recentHistory: [] })
          wx.showToast({ title: '已清空', icon: 'success' })
        }
      }
    })
  }
})
