Page({
  data: {
    inputText: '',
    isDrugTrace: false,
    drugIdCode: '',
    drugSerialNo: '',
    recentHistory: [],
    codeType: 'barcode', // 'barcode' | 'qrcode'
    // 预览优化：分离状态
    codeImage: '',          // 当前显示的图片
    previewText: '',        // 当前预览的文本
    isGeneratingPreview: false,  // 是否正在生成预览
    // 公告
    showAnnouncement: true,
    announcement: '欢迎使用游游制码！如有问题请联系客服',
    // 药品查询
    drugInfo: null,
    drugLoading: false,
    quotaLoading: false,
    isLoggedIn: false,
    isVip: false,
    quotaRemaining: -1,
    // 授权弹窗
    showAvatarAuth: false,
    tempAvatarUrl: '',
    tempNickName: '',
    // 药品信息折叠
    drugInfoCollapsed: false,
    // 首页码图预览
    previewImage: ''
  },

  // 隐藏入口：连续点击标题5次进入管理后台
  _headerTapCount: 0,
  _headerTapTimer: null,
  onHeaderTap() {
    this._headerTapCount++
    clearTimeout(this._headerTapTimer)
    if (this._headerTapCount >= 5) {
      this._headerTapCount = 0
      wx.navigateTo({ url: '/pages/admin/admin' })
    } else {
      this._headerTapTimer = setTimeout(() => {
        this._headerTapCount = 0
      }, 2000)
    }
  },

  // 关闭公告
  closeAnnouncement(e) {
    e.stopPropagation()
    this.setData({ showAnnouncement: false })
    wx.setStorageSync('announcement_closed', true)
  },

  // 点击公告
  onAnnouncementTap() {
    // 可以在这里添加点击公告后的操作，如打开公告详情页面
  },

  onLoad() {
    // 检查公告是否已关闭
    const announcementClosed = wx.getStorageSync('announcement_closed')
    if (announcementClosed) {
      this.setData({ showAnnouncement: false })
    }
    this.loadHistory()
    this.checkLoginAndQuota()
  },

  onShow() {
    this.loadHistory()
    if (this.data.isLoggedIn) {
      this.checkQuota()
    }
  },

  loadHistory() {
    try {
      const scanHistory = wx.getStorageSync('scan_history') || []
      const genHistory = wx.getStorageSync('gen_history') || []
      const all = []
      scanHistory.forEach(item => {
        const displayParts = item.displayParts || this._parseGsDisplayParts(item.value)
        all.push({
          value: item.value,
          displayParts,
          source: 'scan',
          sourceLabel: '扫码',
          type: item.type === '二维码' ? 'qrcode' : 'barcode',
          typeLabel: item.typeLabel || item.type,
          isGS1: item.isGS1,
          length: item.value.length,
          time: item.time,
          timestamp: item.timestamp
        })
      })
      genHistory.forEach(item => {
        all.push({
          value: item.text,
          source: 'generate',
          sourceLabel: '生成码',
          type: item.type,
          typeLabel: item.typeLabel,
          length: item.text.length,
          time: item.time,
          timestamp: item.timestamp,
          imagePath: item.imagePath || ''
        })
      })
      all.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      this.setData({ recentHistory: all.slice(0, 5) })
    } catch (e) {
      console.error('读取历史失败', e)
    }
  },

  onInputChange(e) {
    const text = e.detail.value
    const info = this.parseDrugTrace(text.trim())
    // 只更新输入文本和解析结果，不触发预览
    if (text !== this.data.inputText) {
      this.setData({
        inputText: text,
        ...info
      })
    }
  },

  copyInputText() {
    if (!this.data.inputText) return
    wx.setClipboardData({ data: this.data.inputText, success: () => { wx.showToast({ title: '已复制', icon: 'success' }) } })
  },

  clearInputText() {
    this.setData({
      inputText: '',
      codeImage: '',
      previewText: '',
      isDrugTrace: false,
      drugIdCode: '',
      drugSerialNo: '',
      drugInfo: null,
      isGeneratingPreview: false
    })
    this._lastPreviewText = ''
  },

  toggleDrugInfo() {
    this.setData({ drugInfoCollapsed: !this.data.drugInfoCollapsed })
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

  switchCodeType(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.codeType) return
    const text = this.data.inputText.trim()
    // 切换类型时清空旧图片
    this.setData({ codeType: type, codeImage: '', previewText: '' })
    this._lastPreviewText = ''
    // 如果已有输入内容，切换后自动生成并保存历史
    if (text) {
      if (type === 'qrcode') {
        this.previewQR(() => {
          this.saveToHistory(text, 'qrcode', this.data.codeImage)
        })
      } else {
        this.previewBar(() => {
          this.saveToHistory(text, 'barcode', this.data.codeImage)
        })
      }
    }
  },

  // 显式生成并保存到历史
  quickGenerate() {
    const text = this.data.inputText.trim()
    if (!text) {
      wx.showToast({ title: '请输入内容', icon: 'none' })
      return
    }
    // 设置预览文本，确保显示
    this.setData({ previewText: text })
    if (this.data.codeType === 'qrcode') {
      this.previewQR(() => {
        this.saveToHistory(text, this.data.codeType, this.data.codeImage)
      })
    } else {
      this.previewBar(() => {
        this.saveToHistory(text, this.data.codeType, this.data.codeImage)
      })
    }
  },

  // 预览（不保存历史）
  previewCode(needSaveHistory) {
    if (this.data.codeType === 'qrcode') {
      this.previewQR(null, needSaveHistory)
    } else {
      this.previewBar(null, needSaveHistory)
    }
  },

  // 预览二维码（不保存历史）
  previewQR(onComplete) {
    const text = this.data.inputText.trim()
    if (!text) return

    // 标记生成状态，显示加载效果（不清空旧图片）
    this.setData({ isGeneratingPreview: true, previewText: text })

    // 如果内容没变且已有图片，不重新生成，但如果有回调仍需触发
    if (this._lastPreviewText === text && this.data.codeImage) {
      this.setData({ isGeneratingPreview: false }, () => {
        if (onComplete) onComplete()
      })
      return
    }
    this._lastPreviewText = text

    const query = wx.createSelectorQuery()
    query.select('#qrcodeCanvas')
      .fields({ node: true, size: true })
      .exec(async (res) => {
        try {
          if (!res[0]) {
            this.setData({ isGeneratingPreview: false })
            wx.showToast({ title: '生成失败', icon: 'none' })
            return
          }
          const canvas = res[0].node
          const drawQrcode = require('weapp-qrcode-canvas-2d')
          await drawQrcode({
            canvas, canvasId: 'qrcodeCanvas',
            width: 260, padding: 20,
            background: '#ffffff', foreground: '#000000',
            text, correctLevel: 2
          })
          wx.canvasToTempFilePath({
            canvas, x: 0, y: 0, width: 260, height: 260, destWidth: 780, destHeight: 780,
            success: (res) => {
              // 检查是否被取消或文本已变化
              if (this.data.previewText === text) {
                this.setData({ codeImage: res.tempFilePath, isGeneratingPreview: false }, () => {
                  if (onComplete) onComplete()
                })
              }
            },
            fail: () => {
              this.setData({ isGeneratingPreview: false })
              wx.showToast({ title: '导出失败', icon: 'none' })
            }
          })
        } catch (e) {
          this.setData({ isGeneratingPreview: false })
          wx.showToast({ title: '二维码生成失败', icon: 'none' })
        }
      })
  },

  // 预览条形码（不保存历史）
  previewBar(onComplete) {
    const text = this.data.inputText.trim()
    if (!text) return

    if (!/^[\x00-\x7F]+$/.test(text)) {
      wx.showToast({ title: '条形码仅支持英文数字符号', icon: 'none' })
      this.setData({ isGeneratingPreview: false })
      return
    }

    // 标记生成状态，显示加载效果（不清空旧图片）
    this.setData({ isGeneratingPreview: true, previewText: text })

    // 如果内容没变且已有图片，不重新生成，但如果有回调仍需触发
    if (this._lastPreviewText === text && this.data.codeImage) {
      this.setData({ isGeneratingPreview: false }, () => {
        if (onComplete) onComplete()
      })
      return
    }
    this._lastPreviewText = text

    const query = wx.createSelectorQuery()
    query.select('#barcodeCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        try {
          if (!res[0]) {
            this.setData({ isGeneratingPreview: false })
            wx.showToast({ title: '生成失败', icon: 'none' })
            return
          }
          const canvas = res[0].node
          const dpr = wx.getWindowInfo().pixelRatio

          // 使用固定逻辑尺寸绘制，避免 CSS 尺寸不确定
          const w = 680
          const h = 280
          canvas.width = w * dpr
          canvas.height = h * dpr
          const ctx = canvas.getContext('2d')
          ctx.scale(dpr, dpr)

          const textAreaH = 48
          const barAreaH = h - textAreaH
          const quiet = Math.round(w / 40)
          const barAreaW = w - quiet * 2

          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)

          const codes = this.stringToCode128(text)
          // 每个符号 11 个模块宽度, STOP 符号 13 个模块宽度
          const totalModules = (codes.length - 1) * 11 + 13
          const moduleW = barAreaW / totalModules
          let xPos = quiet
          for (let i = 0; i < codes.length; i++) {
            const c = codes[i]
            const pattern = this.CODE128_PATTERNS[c]
            for (let bar = 0; bar < pattern.length; bar++) {
              const bw = pattern[bar] * moduleW
              if (bar % 2 === 0) {
                ctx.fillStyle = '#000000'
                ctx.fillRect(xPos, 0, bw, barAreaH)
              }
              xPos += bw
            }
          }

          // 底部显示文本
          ctx.fillStyle = '#000000'
          ctx.font = '22px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(text, w / 2, h - textAreaH / 2)

          wx.canvasToTempFilePath({
            canvas,
            x: 0, y: 0,
            width: w, height: h,
            destWidth: w * dpr, destHeight: h * dpr,
            success: (r) => {
              // 检查是否被取消或文本已变化
              if (this.data.previewText === text) {
                this.setData({ codeImage: r.tempFilePath, isGeneratingPreview: false }, () => {
                  if (onComplete) onComplete()
                })
              }
            },
            fail: (err) => {
              this.setData({ isGeneratingPreview: false })
              console.error('条形码导出失败:', err)
              wx.showToast({ title: '导出失败', icon: 'none' })
            }
          })
        } catch (e) {
          this.setData({ isGeneratingPreview: false })
          console.error('条形码生成失败', e)
          wx.showToast({ title: '条形码生成失败', icon: 'none' })
        }
      })
  },

  closePreview() {
    this.setData({ codeImage: '', previewText: '', isGeneratingPreview: false })
    this._lastPreviewText = ''
  },

  saveImage() {
    if (!this.data.codeImage) return
    // 保存时写入历史
    this.saveToHistory(this.data.inputText.trim(), this.data.codeType, this.data.codeImage)
    wx.saveImageToPhotosAlbum({
      filePath: this.data.codeImage,
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

  copyText() {
    if (!this.data.inputText) return
    // 复制时写入历史
    this.saveToHistory(this.data.inputText.trim(), this.data.codeType, this.data.codeImage)
    wx.setClipboardData({ data: this.data.inputText, success: () => { wx.showToast({ title: '已复制', icon: 'success' }) } })
  },

  // ===== 登录与配额 =====
  checkLoginAndQuota() {
    this.setData({ quotaLoading: true })
    wx.cloud.callFunction({
      name: 'drugQuery',
      data: { action: 'login' },
      success: (res) => {
        console.log('login 返回:', JSON.stringify(res))
        if (res.result && res.result.code === 0) {
          const userInfo = res.result.data && res.result.data.userInfo
          // 只有已有用户信息（昵称/头像）才算已登录
          if (userInfo && userInfo.nickName) {
            this.setData({ isLoggedIn: true })
            this.checkQuota()
          } else {
            this.setData({ isLoggedIn: false, quotaLoading: false })
          }
        } else {
          this.setData({ isLoggedIn: false, quotaLoading: false })
        }
      },
      fail: (err) => {
        console.error('login 失败:', JSON.stringify(err))
        this.setData({ isLoggedIn: false, quotaLoading: false })
      }
    })
  },

  checkQuota() {
    wx.cloud.callFunction({
      name: 'drugQuery',
      data: { action: 'checkQuota' },
      success: (res) => {
        if (res.result.code === 0) {
          const d = res.result.data
          this.setData({
            isVip: d.isVip,
            quotaRemaining: d.isVip ? -1 : d.remaining,
            quotaLoading: false
          })
        } else {
          this.setData({ quotaLoading: false })
        }
      },
      fail: () => {
        this.setData({ quotaLoading: false })
      }
    })
  },

  // ===== 药品查询 =====
  onQueryDrug() {
    if (!this.data.isLoggedIn) {
      this.setData({ showAvatarAuth: true })
      return
    }
    this.doQueryDrug()
  },

  doQueryDrug() {
    const code = this.data.inputText.trim()
    if (!code) {
      wx.showToast({ title: '请输入追溯码', icon: 'none' })
      return
    }
    this.setData({ drugLoading: true, drugInfo: null })
    wx.cloud.callFunction({
      name: 'drugQuery',
      data: {
        action: 'queryDrug',
        code: code
      },
      success: (res) => {
        const result = res.result
        if (result.code === 0) {
          const data = result.data
          // 解析阿里健康码上放心 API 返回数据
          try {
            const dtoList = data && data.result && data.result.models && data.result.models.code_full_info_dto
            if (dtoList && dtoList.length > 0) {
              const item = dtoList[0]
              const drug = item.drug_ent_base_d_t_o || {}
              const prod = (item.code_produce_info_d_t_o && item.code_produce_info_d_t_o.produce_info_list && item.code_produce_info_d_t_o.produce_info_list.produce_info_dto && item.code_produce_info_d_t_o.produce_info_list.produce_info_dto[0]) || {}
              const ent = item.p_user_ent_d_t_o || {}
              const statusDto = item.code_status_type_d_t_o || {}

              // 状态码映射：I=在库, S=出库, X=已核销, D=已注销
              const statusMap = { 'A': '已激活', 'I': '已核注', 'O': '已核销', 'C': '已注销', 'E': '码不存在' }
              const statusCode = statusDto.code_status || ''
              const statusText = statusMap[statusCode] || statusCode

              // 码等级映射：包装比例1:5:10 → 码等级3=大码, 2=中码, 1=小码
              const levelMap = { '1': '小码', '2': '中码', '3': '大码' }
              const levelVal = String(item.package_level || '')

              const info = {
                drugName: drug.physic_name || '未知药品',
                approvalNo: drug.approval_licence_no || '',
                producer: ent.ent_name || '',
                spec: drug.prepn_spec || '',
                pkgSpec: drug.pkg_spec_crit || '',
                dosageForm: drug.prepn_type_desc || '',
                physicType: drug.physic_type_desc || '',
                exprie: drug.exprie || '',
                batchNo: prod.batch_no || '',
                produceDate: prod.original_produce_date || prod.produce_date_str || '',
                expireDate: prod.original_expire_date || prod.expire_date || '',
                pkgAmount: prod.pkg_amount || '',
                packageLevel: levelMap[levelVal] || (levelVal ? levelVal + '级码' : ''),
                status: statusText
              }
              this.setData({ drugInfo: info, drugLoading: false })
              this.checkQuota()
            } else {
              this.setData({ drugInfo: { empty: true }, drugLoading: false })
            }
          } catch (e) {
            console.error('解析药品数据失败:', e)
            this.setData({ drugInfo: { empty: true }, drugLoading: false })
          }
        } else if (result.code === 403) {
          this.setData({ drugInfo: { error: true, msg: result.msg }, drugLoading: false, quotaRemaining: 0 })
        } else {
          this.setData({ drugInfo: { error: true, msg: result.msg || '查询失败' }, drugLoading: false })
        }
      },
      fail: () => {
        this.setData({ drugInfo: { error: true, msg: '网络错误' }, drugLoading: false })
      }
    })
  },

  // ===== 授权弹窗 =====
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    if (avatarUrl) {
      this.setData({ tempAvatarUrl: avatarUrl })
    }
  },

  onNickNameInput(e) {
    const val = e.detail.value
    if (val) this.setData({ tempNickName: val })
  },

  onCancelAuth() {
    this.setData({ showAvatarAuth: false })
  },

  onConfirmAuth() {
    const { tempNickName, tempAvatarUrl } = this.data
    const nickName = tempNickName
    if (!nickName) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })

    const doSave = (avatarUrl) => {
      console.log('开始保存用户信息:', { nickName, avatarUrl })
      wx.cloud.callFunction({
        name: 'drugQuery',
        data: {
          action: 'saveUserInfo',
          nickName: nickName,
          avatarUrl: avatarUrl || ''
        },
        success: (res) => {
          wx.hideLoading()
          console.log('saveUserInfo 返回:', JSON.stringify(res))
          if (res.result && res.result.code === 0) {
            this.setData({ showAvatarAuth: false, isLoggedIn: true })
            this.checkQuota()
            this.doQueryDrug()
          } else {
            wx.showToast({
              title: (res.result && res.result.msg) || '保存失败',
              icon: 'none',
              duration: 3000
            })
          }
        },
        fail: (err) => {
          wx.hideLoading()
          console.error('saveUserInfo 调用失败:', JSON.stringify(err))
          wx.showToast({
            title: '网络错误: ' + (err.errMsg || ''),
            icon: 'none',
            duration: 4000
          })
        }
      })
    }

    if (tempAvatarUrl) {
      // 非 cloud:// 开头的都视为临时文件，需上传到云存储
      if (tempAvatarUrl.startsWith('cloud://')) {
        doSave(tempAvatarUrl)
      } else {
        const ext = tempAvatarUrl.split('.').pop() || 'jpg'
        const cloudPath = 'avatars/' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.' + ext
        console.log('上传头像:', tempAvatarUrl, '→', cloudPath)
        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: tempAvatarUrl,
          success: (res) => {
            console.log('头像上传成功:', res.fileID)
            doSave(res.fileID)
          },
          fail: (err) => {
            console.error('头像上传失败:', JSON.stringify(err))
            doSave('')
          }
        })
      }
    } else {
      doSave('')
    }
  },

  // Code 128 编码
  // 每个符号6个宽度值(3条bar + 3空space), 最后1个终止条
  CODE128_PATTERNS: [
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
  ],

  stringToCode128(text) {
    const START_B = 104
    const START_C = 105
    const STOP = 106
    const CODE_B = 100
    const CODE_C = 99

    const bytes = []
    for (let i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i))

    // 决定是否使用 Code C（纯数字且偶数长度时更高效）
    // 简单策略：如果全是数字且长度 >= 4，用 Code C
    const allDigits = bytes.every(b => b >= 48 && b <= 57)

    const codes = []

    if (allDigits && bytes.length >= 4) {
      // 使用 Code C 编码纯数字（两位一组）
      codes.push(START_C)
      let i = 0
      while (i < bytes.length) {
        if (bytes.length - i >= 2) {
          codes.push(parseInt(String.fromCharCode(bytes[i]) + String.fromCharCode(bytes[i + 1])))
          i += 2
        } else {
          // 奇数位最后一位切到 Code B
          codes.push(CODE_B)
          codes.push(bytes[i] - 32)
          i++
        }
      }
    } else {
      // 使用 Code B 编码
      codes.push(START_B)
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i]
        if (b >= 32 && b <= 127) {
          codes.push(b - 32)
        } else {
          // 非 Code B 范围的字符忽略（实际不会出现，因为前面已校验 ASCII）
          codes.push(0)
        }
      }
    }

    // 计算校验和
    let checksum = codes[0]
    for (let i = 1; i < codes.length; i++) {
      checksum += i * codes[i]
    }
    codes.push(checksum % 103)
    codes.push(STOP)

    return codes
  },

  goToScan() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['barCode', 'qrCode', 'datamatrix', 'pdf417'],
      success: (res) => {
        const result = res.result || ''
        if (!result) return
        const info = this.parseDrugTrace(result.trim())
        // 根据扫码类型设置码类型
        const isQR = res.scanType === 'QR_CODE' || res.scanType === 'DATA_MATRIX' || res.scanType === 'PDF_417'
        this.setData({
          inputText: result,
          drugInfo: null,
          codeType: isQR ? 'qrcode' : 'barcode',
          codeImage: '',
          previewText: '',
          ...info
        })
        this._lastPreviewText = ''
        // 保存扫码历史（保留原始结果）
        this.saveScanHistory(result, res.scanType)
        // 扫码后生成预览（不需要保存历史）
        this.previewCode(false)
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '扫码失败', icon: 'none' })
        }
      }
    })
  },

  // 保存到历史（带去重：如果已存在则更新timestamp）
  saveToHistory(text, type, imagePath) {
    if (!text) return
    try {
      let genHistory = wx.getStorageSync('gen_history') || []
      const now = new Date()
      const timestamp = now.getTime()
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
      
      // 检查是否已存在（相同内容+相同类型）
      const existingIndex = genHistory.findIndex(item => item.text === text && item.type === type)
      if (existingIndex !== -1) {
        // 存在则更新时间戳移到最前
        const existing = genHistory.splice(existingIndex, 1)[0]
        existing.timestamp = timestamp
        existing.time = timeStr
        existing.date = date
        existing.imagePath = imagePath || existing.imagePath
        genHistory.unshift(existing)
      } else {
        // 不存在则新增
        genHistory.unshift({
          text,
          type,
          typeLabel: type === 'qrcode' ? '二维码' : '条形码',
          time: timeStr,
          date,
          timestamp,
          imagePath: imagePath || ''
        })
      }
      
      if (genHistory.length > 100) genHistory = genHistory.slice(0, 100)
      wx.setStorageSync('gen_history', genHistory)
      // 刷新最近记录
      this.loadHistory()
    } catch (e) {
      console.error('保存生成历史失败', e)
    }
  },

  saveScanHistory(value, scanType) {
    try {
      let scanHistory = wx.getStorageSync('scan_history') || []
      const now = new Date()
      const timestamp = now.getTime()
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
      const type = (scanType === 'QR_CODE' || scanType === 'DATA_MATRIX' || scanType === 'PDF_417') ? '二维码' : '条形码'
      // 检测 GS1 前缀
      const isGS1 = value.charCodeAt(0) === 29 || value.startsWith(']C1') || value.startsWith(']d')
      // 将 GS 分隔符转换为显示用的部分
      const displayParts = this._parseGsDisplayParts(value)
      // 去重
      scanHistory = scanHistory.filter(item => !(item.value === value && item.type === type))
      scanHistory.unshift({
        value,
        displayParts,
        type,
        typeLabel: type,
        isGS1,
        time: timeStr,
        date,
        timestamp
      })
      if (scanHistory.length > 100) scanHistory = scanHistory.slice(0, 100)
      wx.setStorageSync('scan_history', scanHistory)
      this.setData({ recentHistory: scanHistory.slice(0, 5) })
    } catch (e) {
      console.error('保存扫码历史失败', e)
    }
  },

  // 解析 GS 分隔符为显示部分
  _parseGsDisplayParts(value) {
    const parts = []
    const gsChar = '\x1D'
    if (!value.includes(gsChar)) {
      parts.push({ text: value, isGs: false })
      return parts
    }
    const segments = value.split(gsChar)
    segments.forEach((seg, i) => {
      if (seg) parts.push({ text: seg, isGs: false })
      if (i < segments.length - 1) parts.push({ text: 'gs', isGs: true })
    })
    return parts
  },

  // 点击历史项 - 生成码记录弹出预览，扫码记录复制内容
  onHistoryItemTap(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.recentHistory[index]
    if (!item) return
    if (item.source === 'generate' && item.imagePath) {
      this.setData({ previewImage: item.imagePath })
    } else {
      wx.setClipboardData({
        data: item.value,
        success: () => { wx.showToast({ title: '已复制', icon: 'success' }) }
      })
    }
  },

  closeImagePreview() {
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

  // 查看全部历史
  viewAllHistory() {
    wx.navigateTo({ url: '/pages/history/history' })
  },

  // 跳转到批量生成页面
  goToBatchBarcode() {
    wx.navigateTo({ url: '/pages/batchbarcode/batchbarcode' })
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
  },

  onShareAppMessage() {
    return {
      title: '游游制码 - 扫码 · 生成 · 识别',
      path: '/pages/index/index'
    }
  },

  onShareTimeline() {
    return {
      title: '游游制码 - 扫码 · 生成 · 识别'
    }
  }
})
