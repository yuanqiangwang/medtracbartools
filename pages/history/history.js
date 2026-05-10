const STORAGE_KEY_GEN = 'history_generate'
const STORAGE_KEY_SCAN = 'history_scan'
const MAX_HISTORY = 100

Page({
  data: {
    activeTab: 'generate',
    generateList: [],
    scanList: [],
    previewSrc: ''
  },

  onLoad(options) {
    if (options.tab === 'scan') {
      this.setData({ activeTab: 'scan' })
    }
    this.loadHistory()
  },

  onShow() {
    this.loadHistory()
  },

  loadHistory() {
    try {
      const genRaw = wx.getStorageSync(STORAGE_KEY_GEN) || []
      const scanRaw = wx.getStorageSync(STORAGE_KEY_SCAN) || []
      this.setData({
        generateList: genRaw.map(this.formatItem),
        scanList: scanRaw.map(this.formatItem)
      })
    } catch (e) {
      console.error('加载历史记录失败:', e)
    }
  },

  formatItem(item) {
    if (!item) return item
    const d = new Date(item.timestamp || Date.now())
    const pad = n => (n < 10 ? '0' + n : '' + n)
    item.timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    return item
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab, previewSrc: '' })
  },

  onPreviewImage(e) {
    const src = e.currentTarget.dataset.src
    if (!src) return
    this.setData({ previewSrc: src })
  },

  closePreview() {
    this.setData({ previewSrc: '' })
  },

  onCardTap(e) {
    const item = e.currentTarget.dataset.item
    if (!item) return
    // 弹出操作菜单
    const actions = ['复制内容', '重新生成', '删除此条']
    wx.showActionSheet({
      itemList: actions,
      success: (res) => {
        if (res.tapIndex === 0) {
          this.copyContent(item.content)
        } else if (res.tapIndex === 1) {
          this.reGenerate(item)
        } else if (res.tapIndex === 2) {
          this.deleteItem(e.currentTarget.dataset.type, item.id)
        }
      }
    })
  },

  onCopyContent(e) {
    const content = e.currentTarget.dataset.content
    this.copyContent(content)
  },

  copyContent(content) {
    if (!content) return
    wx.setClipboardData({
      data: content,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    })
  },

  reGenerate(item) {
    if (!item || !item.content) return
    const type = item.codeType === 'barcode' ? 'barcode' : 'qrcode'
    wx.navigateTo({
      url: `/pages/${type}/${type}?text=${encodeURIComponent(item.content)}`
    })
  },

  deleteItem(type, id) {
    const key = type === 'generate' ? STORAGE_KEY_GEN : STORAGE_KEY_SCAN
    const listKey = type === 'generate' ? 'generateList' : 'scanList'
    try {
      const list = wx.getStorageSync(key) || []
      const newList = list.filter(i => i.id !== id)
      wx.setStorageSync(key, newList)
      this.setData({ [listKey]: newList.map(this.formatItem) })
      wx.showToast({ title: '已删除', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  },

  onClearHistory() {
    const tab = this.data.activeTab
    const label = tab === 'generate' ? '生成' : '扫码'
    wx.showModal({
      title: '清空记录',
      content: `确定清空所有${label}记录吗？此操作不可恢复。`,
      confirmColor: '#e04040',
      success: (res) => {
        if (!res.confirm) return
        const key = tab === 'generate' ? STORAGE_KEY_GEN : STORAGE_KEY_SCAN
        const listKey = tab === 'generate' ? 'generateList' : 'scanList'
        try {
          wx.removeStorageSync(key)
          this.setData({ [listKey]: [] })
          wx.showToast({ title: '已清空', icon: 'success' })
        } catch (e) {
          wx.showToast({ title: '清空失败', icon: 'none' })
        }
      }
    })
  }
})

// 工具方法：保存历史记录（供其他页面调用）
function saveGenerateHistory(item) {
  try {
    const list = wx.getStorageSync(STORAGE_KEY_GEN) || []
    list.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      codeType: item.codeType, // 'qrcode' | 'barcode'
      content: item.content,
      imagePath: item.imagePath || '',
      timestamp: Date.now()
    })
    if (list.length > MAX_HISTORY) list.length = MAX_HISTORY
    wx.setStorageSync(STORAGE_KEY_GEN, list)
  } catch (e) {
    console.error('保存生成记录失败:', e)
  }
}

function saveScanHistory(item) {
  try {
    const list = wx.getStorageSync(STORAGE_KEY_SCAN) || []
    list.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      scanType: item.scanType || 'QR_CODE', // 'QR_CODE' | 'BARCODE'
      content: item.content,
      timestamp: Date.now()
    })
    if (list.length > MAX_HISTORY) list.length = MAX_HISTORY
    wx.setStorageSync(STORAGE_KEY_SCAN, list)
  } catch (e) {
    console.error('保存扫码记录失败:', e)
  }
}

module.exports = { saveGenerateHistory, saveScanHistory }
