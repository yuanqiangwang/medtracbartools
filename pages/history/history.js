Page({
  data: {
    activeTab: 'scan',
    searchText: '',
    allHistory: [],
    filteredHistory: [],
    groupedHistory: [],
    previewImage: ''
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
        all.push({
          ...item,
          source: 'scan',
          sourceLabel: '扫码',
          type: item.type === '条形码' ? 'barcode' : 'qrcode',
          typeLabel: item.type,
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
    this.setData({ activeTab: tab, previewImage: '' })
    this.applyFilter()
  },

  onSearch(e) {
    this.setData({ searchText: e.detail.value })
    this.applyFilter()
  },

  applyFilter() {
    const { activeTab, searchText, allHistory } = this.data
    // 按 source 过滤：scan 或 generate
    let filtered = allHistory.filter(item => item.source === activeTab)
    if (searchText.trim()) {
      const kw = searchText.trim().toLowerCase()
      filtered = filtered.filter(item =>
        (item.text && item.text.toLowerCase().includes(kw))
      )
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

  onItemTap(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.filteredHistory.find(h => h.id === id)
    if (!item) return
    wx.setClipboardData({
      data: item.text,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
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
  }
})
