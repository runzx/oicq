const mongoose = require('mongoose')
const Sequence = require('./sequence')
// const { RepeatException, NotFound } = require('../../core/exception')

const { Schema, model } = mongoose
const { Mixed, ObjectId, Decimal128 } = Schema.Types

const bisSchema = new Schema({
  no: Number,
  name: { type: String, unique: true, required: true },
  title: String,
  online: { type: Number, default: 1 },
  category: String,
  status: { type: Number, default: 1 },
  mpInfo: {}, // 小程序信息
  img: String, //log
  appId: String, // 小程序
  secret: { type: String, select: false },
  encodingAESKey: String,
  mch_id: String,//微信支付 参数
  partnerKey: { type: String, select: false },

  category: String,
  auths: [], // 商户所有的权限
  permissions: [{ type: String, ref: 'Permission' }],  // v0.3.5版本
  // permissions: [{ type: ObjectId, ref: 'Permission' }],  // v0.3.5版本
  groups: [{ type: String, ref: 'Group' }],  // 商户所有分组

  sysConfig: {},
  ddConfig: {}, //钉钉机器人配置
  createdAt: { type: Date, select: false },
  updatedAt: { type: Date, select: false },
}, { timestamps: true })

bisSchema.pre('save', function (next) {
  const self = this
  if (this.isNew)
    Sequence.increment('Bis', function (err, doc) {
      if (err) throw err
      self.no = doc.next
      next()
    })
  else next()
})
// bisSchema.set('toObject', { getters: true })
bisSchema.set('toJSON', { getters: true })
bisSchema.statics = {
  getDDConfig(name) {
    return this.findOne({ name }, 'ddConfig')
  },
  async getBisPage(page = 1, pageSize = 15, query) {
    if (query) query = { name: { $regex: query, $options: 'i' } }
    else query = {}
    const total = await this.countDocuments(query)
    const items = await this.find(query)
      .sort('-updatedAt')
      .limit(+pageSize)
      .skip(+pageSize * (+page - 1))
    return { items, total, errcode: 0 }
  },
  async createBis(data) {
    const { name } = data
    const res = await this.findOne({ name })
    if (res) throw new RepeatException({ msg: '此商户名称已存在，请重新命名' })
    return this.create(data)
  },
  findBisById(bisId) {
    return this.findById(bisId)
  },
  updateBis(bisId, data) {
    delete data._id
    return this.findByIdAndUpdate(bisId, data)
  },
  async getPermission(bisId) {
    const res = await this.findById(bisId, 'permissions').populate('permissions')

    if (!res) throw new NotFound({ msg: '没有此商户,bisId:' + bisId })
    return res.permissions
  },

  async getSysInfoConfigByBisId(bisId) {
    const res = await this.findById(bisId, 'sysConfig')
    return res ? res.sysConfig : null
  },

  getWxPayConfig(bisId) {
    if (bisId === 'bosszs') bisId = '5e1c28a98616e6f63d8d67c3'
    return this.findById(bisId, 'mch_id partnerKey appId secret')
  },

  getGroupsByBisId(bisId) {
    // if (bisId === 'bosszs') bisId = '5e1c28a98616e6f63d8d67c3'
    return this.findById(bisId, 'no').populate('groups', 'no name')
  }
}
module.exports = model('Bis', bisSchema)
