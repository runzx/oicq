const mongoose = require('mongoose')
const { DataBaseUrl } = require('../config')

mongoose.connect(
  DataBaseUrl,
  {
    useNewUrlParser: true, useFindAndModify: false,
    useUnifiedTopology: true, useCreateIndex: true
  },
  () => console.log('mongodb is connect:' + DataBaseUrl)
)
mongoose.connection.on('error', console.error)

module.exports = {
  User: require('./user'),
  Message: require('./message'),
  // AppConf: require('./appConf'),
  // Bis: require('./bis'),
  Group: require('./group'),
  // Log: require('./log'),
  // File: require('./file'),
  // Product: require('./product'),
  // Category: require('./category'),
  // Ad: require('./ad'),
  // BtcAd: require('./btcAd'),
  // Booking: require('./booking'),
  // Course: require('./course'),
  // Banner: require('./banner'),
  // Theme: require('./theme'),
  // Article: require('./article'),
  // Activity: require('./activity'),
  // SpecKey: require('./specKey'),
  // SpecValue: require('./specValue'),
  // Sku: require('./sku'),
  // SKU: require('./sku'),
  // Spu: require('./spu'),
  // SPU: require('./spu'),
  // Order: require('./order'),
  // Pay: require('./pay'),
  // Coupon: require('./coupon'),
  // CouponTemplate: require('./coupon-template'),
  // UserCoupon: require('./user-coupon'),
  // Member: require('./member'),
  // MemberCard: require('./member-card'),
  // RechargeRecord: require('./recharge-record'),
  // Permission: require('./permission'),
  // Address: require('./address'),

}
