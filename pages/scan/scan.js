Page({
  data: {
    result: '',
    resultType: '',
    resultFormat: '',
    isUrl: false,
    history: []
  },

  onLoad(options) {
    this.loadHistory()
    // 如果是查看历史，不自动扫码
    if (options.action !== 'history') {
      this.startScan()
    }
  },

  onShow() {
    this.loadHistory()
  },

  // 加载历史记录
  loadHistory() {
    try {
      const history = wx.getStorageSync('scan_history') || []
      this.setData({ history })
    } catch (e) {
      console.error('读取历史失败', e)
    }
  },

  // 保存历史记录
  saveToHistory(value, type, format) {
    try {
      let history = wx.getStorageSync('scan_history') || []
      const now = new Date()
      const timeStr = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
      history.unshift({
        value,
        type,
        format,
        time: timeStr
      })
      // 最多保留 50 条
      if (history.length > 50) history = history.slice(0, 50)
      wx.setStorageSync('scan_history', history)
      this.setData({ history })
    } catch (e) {
      console.error('保存历史失败', e)
    }
  },

  // 开始扫码
  startScan() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['barCode', 'qrCode', 'datamatrix', 'pdf417'],
      success: (res) => {
        const result = res.result || ''
        const scanType = res.scanType || 'unknown'
        const typeLabel = this.getTypeLabel(scanType)
        const formatLabel = this.getFormatLabel(scanType)
        const isUrl = this.checkIsUrl(result)

        this.setData({
          result,
          resultType: typeLabel,
          resultFormat: formatLabel,
          isUrl
        })

        this.saveToHistory(result, typeLabel, formatLabel)
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '扫码失败', icon: 'none' })
        }
      }
    })
  },

  // 获取码类型标签
  getTypeLabel(scanType) {
    if (scanType.indexOf('QR_CODE') !== -1) return '二维码'
    if (scanType.indexOf('EAN_') !== -1 || scanType.indexOf('UPC_') !== -1) return '商品条码'
    if (scanType.indexOf('CODE_128') !== -1 || scanType.indexOf('CODE_39') !== -1) return '条形码'
    if (scanType.indexOf('CODE') !== -1 || scanType.indexOf('BAR') !== -1) return '条形码'
    if (scanType.indexOf('DATA_MATRIX') !== -1) return 'Data Matrix'
    if (scanType.indexOf('PDF_417') !== -1) return 'PDF 417'
    return '码图'
  },

  // 获取格式标签
  getFormatLabel(scanType) {
    const map = {
      'QR_CODE': 'QR Code',
      'EAN_13': 'EAN-13',
      'EAN_8': 'EAN-8',
      'UPC_A': 'UPC-A',
      'UPC_E': 'UPC-E',
      'CODE_128': 'Code 128',
      'CODE_39': 'Code 39',
      'CODE_93': 'Code 93',
      'CODABAR': 'Codabar',
      'ITF': 'ITF',
      'DATA_MATRIX': 'DataMatrix',
      'PDF_417': 'PDF417'
    }
    return map[scanType] || scanType
  },

  // 检测是否为网址
  checkIsUrl(str) {
    return /^https?:\/\//i.test(str)
  },

  // 复制内容
  copyResult() {
    wx.setClipboardData({
      data: this.data.result,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  },

  // 打开链接
  openUrl() {
    wx.copyClipboardData && wx.copyClipboardData({ data: this.data.result })
    // 复制链接提示用户在浏览器打开
    wx.setClipboardData({
      data: this.data.result,
      success: () => {
        wx.showModal({
          title: '链接已复制',
          content: '链接已复制到剪贴板，请在浏览器中打开',
          showCancel: false,
          confirmText: '知道了'
        })
      }
    })
  },

  // 根据扫码结果跳转生成页面
  generateFromResult() {
    const type = this.data.resultType === '二维码' ? 'qrcode' : 'barcode'
    wx.navigateTo({
      url: `/pages/barcode/barcode?type=${type}&text=${encodeURIComponent(this.data.result)}`
    })
  },

  // 点击历史项
  showHistoryItem(e) {
    const item = e.currentTarget.dataset.item
    const isUrl = this.checkIsUrl(item.value)
    this.setData({
      result: item.value,
      resultType: item.type,
      resultFormat: item.format,
      isUrl
    })
  },

  // 清空历史
  clearHistory() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有扫码历史吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('scan_history')
          this.setData({ history: [] })
          wx.showToast({ title: '已清空', icon: 'success' })
        }
      }
    })
  }
})
