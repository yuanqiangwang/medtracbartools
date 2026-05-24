const { parseGS1, formatSummary } = require('../../utils/gs1-parser')

Page({
  data: {
    activeTab: 'scan',
    searchText: '',
    allHistory: [],
    filteredHistory: [],
    groupedHistory: [],
    previewImage: '',
    // GS1 详情弹窗
    showDetail: false,
    detailItem: null
  },

  onLoad() {
    this.loadHistory()
  },

  onShow() {
    this.loadHistory()
  },

  loadHistory() {
    try {
      const genHistory = wx.getStorageSync('gen_history') || []
      const scanHistory = wx.getStorageSync('scan_history') || []
      const all = []

      // 生成码记录
      genHistory.forEach(item => {
        all.push({
          ...item,
          source: 'generate',
          sourceLabel: '生成码',
          id: 'gen_' + item.timestamp + '_' + item.text
        })
      })

      // 扫码记录
      scanHistory.forEach(item => {
        // GS1 解析
        const gs1 = item.isGS1 ? parseGS1(item.value) : null
        all.push({
          ...item,
          source: 'scan',
          sourceLabel: '扫码',
          type: item.type === '条形码' ? 'barcode' : 'qrcode',
          typeLabel: item.type,
          isGS1: item.isGS1,
          gs1: gs1,
          id: 'scan_' + item.timestamp + '_' + item.value,
          text: item.value,
          imagePath: item.imagePath || ''
        })
      })

      // 按时间倒序
      all.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      this.setData({ allHistory: all })
      this.applyFilter()
    } catch (e) {
      console.error('读取历史失败', e)
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    this.setData({ activeTab: tab, previewImage: '', showDetail: false, detailItem: null })
    this.applyFilter()
  },

  onSearch(e) {
    this.setData({ searchText: e.detail.value })
    this.applyFilter()
  },

  applyFilter() {
    const { activeTab, searchText, allHistory } = this.data
    let filtered = allHistory.filter(item => item.source === activeTab)
    if (searchText.trim()) {
      const kw = searchText.trim().toLowerCase()
      filtered = filtered.filter(item => {
        if (item.text && item.text.toLowerCase().includes(kw)) return true
        // Also search GS1 fields
        if (item.gs1) {
          const gs1Text = [item.gs1.gtin, item.gs1.lot, item.gs1.expirationDate, item.gs1.serial, item.gs1.productionDate].filter(Boolean).join(' ').toLowerCase()
          if (gs1Text.includes(kw)) return true
        }
        return false
      })
    }
    // 按日期分组
    const groups = {}
    filtered.forEach(item => {
      const dateKey = item.date || this.formatDate(item.timestamp) || '未知日期'
      if (!groups[dateKey]) groups[dateKey] = []
      groups[dateKey].push(item)
    })
    const groupedHistory = Object.keys(groups).map(date => ({
      date,
      items: groups[date]
    }))

    this.setData({ filteredHistory: filtered, groupedHistory })
  },

  formatDate(timestamp) {
    if (!timestamp) return '未知日期'
    const d = new Date(timestamp)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const diff = today - target
    if (diff === 0) return '今天'
    if (diff === 86400000) return '昨天'
    if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)}天前`
    return `${d.getMonth() + 1}月${d.getDate()}日`
  },

  // 点击卡片 - GS1 打开详情，普通复制内容
  onItemTap(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.filteredHistory.find(h => h.id === id)
    if (!item) return
    if (item.isGS1 && item.gs1) {
      this.setData({ showDetail: true, detailItem: item })
    } else {
      wx.setClipboardData({
        data: item.text,
        success: () => wx.showToast({ title: '已复制', icon: 'success' })
      })
    }
  },

  // 关闭详情
  closeDetail() {
    this.setData({ showDetail: false, detailItem: null })
  },

  // 复制原始数据
  copyRawData() {
    const item = this.data.detailItem
    if (!item) return
    wx.setClipboardData({
      data: item.text,
      success: () => wx.showToast({ title: '已复制 GS1 原始数据', icon: 'success' })
    })
  },

  onThumbTap(e) {
    const imagePath = e.currentTarget.dataset.image
    if (!imagePath) {
      wx.showToast({ title: '无预览图', icon: 'none' })
      return
    }
    this.setData({ previewImage: imagePath })
  },

  closePreview() {
    this.setData({ previewImage: '' })
  },

  savePreviewImage() {
    if (!this.data.previewImage) return
    wx.saveImageToPhotosAlbum({
      filePath: this.data.previewImage,
      success: () => { wx.showToast({ title: '已保存', icon: 'success' }) },
      fail: (err) => {
        if (err.errMsg.includes('auth deny') || err.errMsg.includes('authorize')) {
          wx.showModal({
            title: '提示', content: '需要相册权限才能保存，是否前往设置？',
            success: (res) => { if (res.confirm) wx.openSetting() }
          })
        }
      }
    })
  },

  onCopyItem(e) {
    const text = e.currentTarget.dataset.text
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    })
  },

  onDeleteItem(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条记录吗？',
      success: (res) => {
        if (!res.confirm) return
        const item = this.data.allHistory.find(h => h.id === id)
        if (!item) return
        if (item.source === 'generate') {
          let genHistory = wx.getStorageSync('gen_history') || []
          genHistory = genHistory.filter(h => !(h.text === item.text && h.type === item.type && h.timestamp === item.timestamp))
          wx.setStorageSync('gen_history', genHistory)
        } else {
          let scanHistory = wx.getStorageSync('scan_history') || []
          scanHistory = scanHistory.filter(h => !(h.value === item.text && h.type === item.typeLabel && h.timestamp === item.timestamp))
          wx.setStorageSync('scan_history', scanHistory)
        }
        this.setData({ showDetail: false, detailItem: null })
        this.loadHistory()
        wx.showToast({ title: '已删除', icon: 'success' })
      }
    })
  },

  clearAll() {
    wx.showModal({
      title: '清空记录',
      content: '确定清空所有' + (this.data.activeTab === 'scan' ? '扫码' : '生成码') + '记录吗？',
      success: (res) => {
        if (!res.confirm) return
        const { activeTab } = this.data
        if (activeTab === 'scan') {
          wx.removeStorageSync('scan_history')
        } else {
          wx.removeStorageSync('gen_history')
        }
        this.loadHistory()
        wx.showToast({ title: '已清空', icon: 'success' })
      }
    })
  },

  onShareAppMessage() {
    return {
      title: '游游制码 - 历史记录',
      path: '/pages/history/history'
    }
  },

  onShareTimeline() {
    return {
      title: '游游制码 - 历史记录'
    }
  }
})
