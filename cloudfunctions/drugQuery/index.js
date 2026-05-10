const cloud = require('wx-server-sdk')
const ApiClient = require('./sdk/index.js').ApiClient

cloud.init({ env: 'cloud1-d8gp0p7d2f9b2ce45' })

const db = cloud.database()
const DAILY_LIMIT = 5
// 管理员 openid 列表（首次使用后替换为你自己的 openid）
const ADMIN_OPENIDS = ['oG_z70NSHzzybBz_5MuqjME679Zo']

// 检查是否为管理员
function isAdmin(openid) {
  return ADMIN_OPENIDS.indexOf(openid) !== -1
}

// 确保集合存在，不存在则创建
async function ensureCollection(name) {
  try {
    await db.collection(name).count()
  } catch (e) {
    // 集合不存在，尝试创建
    try {
      await db.createCollection(name)
      console.log(`集合 ${name} 创建成功`)
    } catch (createErr) {
      console.error(`创建集合 ${name} 失败:`, createErr.message)
    }
  }
}

// 检查是否为不限次数的 VIP 用户
async function isVipUser(openid) {
  await ensureCollection('vip_users')
  try {
    const res = await db.collection('vip_users').where({ openid: openid }).limit(1).get()
    return res.data.length > 0
  } catch (e) {
    console.error('查询VIP用户失败:', e.message)
    return false
  }
}

// 码上放心 API 客户端（复用连接）
let client = null

function getClient() {
  if (!client) {
    client = new ApiClient({
      appkey: process.env.TOP_APPKEY || '',
      appsecret: process.env.TOP_APPSECRET || '',
      REST_URL: 'http://gw.api.taobao.com/router/rest'
    })
  }
  return client
}

/**
 * 查询追溯码药品信息
 * API: alibaba.alihealth.drugtrace.top.yljg.query.codedetail
 * 必填参数：ref_ent_id（企业唯一标识）, codes（码列表，逗号分隔）
 */
function queryDrugByCode(ref_ent_id, codes) {
  return new Promise((resolve, reject) => {
    const c = getClient()
    c.execute('alibaba.alihealth.drugtrace.top.yljg.query.codedetail', {
      ref_ent_id: ref_ent_id,
      codes: codes
    }, function (error, response) {
      if (error) {
        reject(error)
      } else {
        resolve(response)
      }
    })
  })
}

/**
 * 获取企业信息
 * API: alibaba.alihealth.drug.msc.getentinfonew
 */
function getEntInfo(ref_ent_id) {
  return new Promise((resolve, reject) => {
    const c = getClient()
    c.execute('alibaba.alihealth.drug.msc.getentinfonew', {
      ref_ent_id: ref_ent_id
    }, function (error, response) {
      if (error) {
        reject(error)
      } else {
        resolve(response)
      }
    })
  })
}

// 云函数入口
exports.main = async (event, context) => {
  const { action, code, ref_ent_id } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  console.log('收到请求:', JSON.stringify(event), 'openid:', openid)

  // 需要登录的 action
  if (['queryDrug', 'checkQuota'].indexOf(action) !== -1 && !openid) {
    return { code: 401, msg: '请先登录' }
  }

  try {
    switch (action) {
      case 'login': {
        // 通过云开发自动获取用户 openid，无需用户手动授权
        // 同时检查是否已填写用户信息
        await ensureCollection('users_info')
        let userInfo = null
        try {
          const infoRes = await db.collection('users_info').where({ openid: openid }).limit(1).get()
          if (infoRes.data.length > 0) {
            userInfo = { nickName: infoRes.data[0].nickName, avatarUrl: infoRes.data[0].avatarUrl }
          }
        } catch (e) { }
        return { code: 0, data: { openid, userInfo } }
      }

      case 'saveUserInfo': {
        // 保存用户头像和昵称（前端已上传头像到云存储，传入永久 fileID）
        const { nickName, avatarUrl } = event
        if (!openid) return { code: 401, msg: '请先登录' }
        await ensureCollection('users_info')
        const existRes = await db.collection('users_info').where({ openid: openid }).limit(1).get()
        if (existRes.data.length > 0) {
          await db.collection('users_info').doc(existRes.data[0]._id).update({
            data: { nickName: nickName || '', avatarUrl: avatarUrl || '', updatedAt: new Date() }
          })
        } else {
          await db.collection('users_info').add({
            data: { openid, nickName: nickName || '', avatarUrl: avatarUrl || '', createdAt: new Date() }
          })
        }
        return { code: 0, msg: '保存成功' }
      }

      case 'checkQuota': {
        // VIP 用户不限次数
        const vip = await isVipUser(openid)
        if (vip) {
          return { code: 0, data: { used: 0, limit: -1, remaining: -1, isVip: true } }
        }
        await ensureCollection('user_quota')
        const today = new Date()
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        const res = await db.collection('user_quota').where({ openid: openid, date: dateStr }).get()
        let used = 0
        if (res.data.length > 0) {
          used = res.data[0].used || 0
        }
        return { code: 0, data: { used, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - used), isVip: false } }
      }

      case 'queryDrug': {
        // VIP 用户跳过次数限制
        const vip = await isVipUser(openid)
        if (!vip) {
          await ensureCollection('user_quota')
          // 检查并扣减查询次数
          const today = new Date()
          const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
          const qRes = await db.collection('user_quota').where({ openid: openid, date: dateStr }).get()
          let used = 0
          let docId = null
          if (qRes.data.length > 0) {
            used = qRes.data[0].used || 0
            docId = qRes.data[0]._id
          }
          if (used >= DAILY_LIMIT) {
            return { code: 403, msg: `今日查询次数已用完（每日${DAILY_LIMIT}次）` }
          }
          // 扣减次数
          if (docId) {
            await db.collection('user_quota').doc(docId).update({ data: { used: used + 1 } })
          } else {
            await db.collection('user_quota').add({ data: { openid: openid, date: dateStr, used: 1 } })
          }
        }

        if (!code) {
          return { code: 400, msg: '缺少追溯码参数 code' }
        }
        // ref_ent_id 从前端传入或使用默认企业ID
        const entId = ref_ent_id || process.env.DEFAULT_REF_ENT_ID || ''
        if (!entId) {
          return { code: 400, msg: '缺少企业ID参数 ref_ent_id' }
        }
        console.log('开始查询追溯码:', code, '企业ID:', entId)
        const result = await queryDrugByCode(entId, code)
        console.log('查询结果:', JSON.stringify(result))
        return { code: 0, data: result }
      }

      case 'getEntInfo': {
        if (!ref_ent_id) {
          return { code: 400, msg: '缺少企业ID参数 ref_ent_id' }
        }
        const result = await getEntInfo(ref_ent_id)
        return { code: 0, data: result }
      }

      // ===== 管理员操作 =====
      case 'admin_getMyOpenid': {
        // 获取自己的 openid（用于配置管理员）
        return { code: 0, data: { openid } }
      }

      case 'admin_listUsers': {
        if (!isAdmin(openid)) return { code: 403, msg: '无管理员权限' }
        await ensureCollection('user_quota')
        // 获取所有有查询记录的用户，按日期倒序
        const MAX_LIMIT = 100
        const countRes = await db.collection('user_quota').count()
        const total = countRes.total
        const batchTimes = Math.ceil(total / MAX_LIMIT)
        let allRecords = []
        for (let i = 0; i < batchTimes; i++) {
          const res = await db.collection('user_quota').skip(i * MAX_LIMIT).limit(MAX_LIMIT).orderBy('date', 'desc').get()
          allRecords = allRecords.concat(res.data)
        }
        // 按 openid 分组
        const userMap = {}
        for (const record of allRecords) {
          if (!userMap[record.openid]) {
            userMap[record.openid] = { openid: record.openid, totalUsed: 0, lastDate: record.date }
          }
          userMap[record.openid].totalUsed += (record.used || 0)
          if (record.date > userMap[record.openid].lastDate) {
            userMap[record.openid].lastDate = record.date
          }
        }
        const users = Object.values(userMap)
        // 查询哪些是 VIP
        await ensureCollection('vip_users')
        const vipRes = await db.collection('vip_users').limit(MAX_LIMIT).get()
        const vipSet = new Set(vipRes.data.map(v => v.openid))
        users.forEach(u => { u.isVip = vipSet.has(u.openid) })
        // 查询用户头像昵称
        await ensureCollection('users_info')
        let allUserInfo = []
        const infoCount = await db.collection('users_info').count()
        const infoBatch = Math.ceil(infoCount.total / MAX_LIMIT)
        for (let i = 0; i < infoBatch; i++) {
          const res = await db.collection('users_info').skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()
          allUserInfo = allUserInfo.concat(res.data)
        }
        const infoMap = {}
        allUserInfo.forEach(info => { infoMap[info.openid] = { nickName: info.nickName, avatarUrl: info.avatarUrl } })
        users.forEach(u => {
          u.nickName = (infoMap[u.openid] && infoMap[u.openid].nickName) || ''
          u.avatarUrl = (infoMap[u.openid] && infoMap[u.openid].avatarUrl) || ''
        })
        // 将 cloud:// 头像转为临时 HTTP 链接，否则其他用户无法访问
        const cloudAvatars = users.filter(u => u.avatarUrl && u.avatarUrl.startsWith('cloud://')).map(u => u.avatarUrl)
        if (cloudAvatars.length > 0) {
          try {
            const urlRes = await cloud.getTempFileURL({ fileList: cloudAvatars })
            if (urlRes.fileList) {
              const urlMap = {}
              urlRes.fileList.forEach(f => { if (f.tempFileURL) urlMap[f.fileID] = f.tempFileURL })
              users.forEach(u => {
                if (u.avatarUrl && urlMap[u.avatarUrl]) {
                  u.avatarUrl = urlMap[u.avatarUrl]
                }
              })
            }
          } catch (e) {
            console.error('获取头像临时链接失败:', e.message)
          }
        }
        return { code: 0, data: { users } }
      }

      case 'admin_addVip': {
        if (!isAdmin(openid)) return { code: 403, msg: '无管理员权限' }
        const targetOpenid = event.targetOpenid
        if (!targetOpenid) return { code: 400, msg: '缺少 targetOpenid' }
        await ensureCollection('vip_users')
        // 检查是否已是 VIP
        const existRes = await db.collection('vip_users').where({ openid: targetOpenid }).limit(1).get()
        if (existRes.data.length > 0) {
          return { code: 0, msg: '该用户已是VIP' }
        }
        await db.collection('vip_users').add({ data: { openid: targetOpenid, addedAt: new Date(), addedBy: openid } })
        return { code: 0, msg: 'VIP添加成功' }
      }

      case 'admin_removeVip': {
        if (!isAdmin(openid)) return { code: 403, msg: '无管理员权限' }
        const targetOpenid = event.targetOpenid
        if (!targetOpenid) return { code: 400, msg: '缺少 targetOpenid' }
        const delRes = await db.collection('vip_users').where({ openid: targetOpenid }).remove()
        return { code: 0, msg: 'VIP移除成功', removed: delRes.stats.removed }
      }

      default:
        return { code: 400, msg: '未知 action，支持: checkQuota, queryDrug, getEntInfo' }
    }
  } catch (err) {
    console.error('云函数执行错误:', err)
    return { code: 500, msg: err.message || '服务器内部错误' }
  }
}
