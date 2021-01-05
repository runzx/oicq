'use strict'

const { createClient } = require('../client')
const { uin, password } = require('../config')
const { User, Message, Group } = require('../model')
const { MessageService } = require('../service/message')

// try {
//     var {createClient} = require("../client");
// } catch {
//     var {createClient} = require("oicq");
// }

// your account
// const uin = 843476168
const bot = createClient(uin, {
  log_level: 'debug', //日志级别设置为debug
  platform: 1 //登录设备选择为手机
})

//监听并输入滑动验证码ticket(同一地点只需验证一次)
bot.on('system.login.slider', () => {
  process.stdin.once('data', input => {
    bot.sliderLogin(input)
  })
})

//监听设备锁验证(同一设备只需验证一次)
bot.on('system.login.device', () => {
  bot.logger.info('验证完成后敲击Enter继续..')
  process.stdin.once('data', () => {
    bot.login()
  })
})

//监听上线事件
bot.on('system.online', () => {
  console.log(`Logged in as ${bot.nickname}!`)
})

//自动同意好友申请
// bot.on("request.friend.add", (data)=>{
//     bot.setFriendAddRequest(data.flag);
// });

//自动同意群邀请
// bot.on("request.group.invite", (data)=>{
//     bot.setGroupAddRequest(data.flag);
// });

//监听私聊
bot.on('message.private', data => {
  console.log(data)
  MessageService.userMsg(data)
  // bot.sendPrivateMsg(data.user_id, "hello");
  // let { time, message_type: messageType,
  //   sender, user_id: qq, sub_type: subType,
  //   raw_message: rawMessage,
  //   message,
  //   message_id: messageId,
  //   self_id: receiveId
  // } = data
  // time = time * 1000
  // const { sex, card: groupNickName, area: city, ...info } = sender
  // User.updateInfo({ ...info, _id: qq, sex, groupNickName, city, qq, subType, messages: [{ time, rawMessage, messageId, receiveId }] })
  // Message.create({ _id: messageId, time, messageType, rawMessage, message, qq, receiveId })
})

//监听群聊
bot.on('message.group', data => {
  console.log(data)
  MessageService.groupMsg(data)
  // bot.sendGroupMsg(data.group_id, "hello");
  // let { group_id: groupId, group_name: groupName, sender, user_id: qq,
  //   sub_type: subType,
  //   raw_message: rawMessage,
  //   message, time, message_type: messageType,
  //   message_id: messageId,
  //   self_id: receiveId } = data
  // time = time * 1000
  // Message.create({ groupId, _id: messageId, time, messageType, rawMessage, message, qq, receiveId })
  // Group.updateInfo({ groupId, groupName, qq, receiveId, messages: [{ time, rawMessage, messageId, qq }] })
  // const { sex, card: groupNickName, area: city, ...info } = sender
  // User.updateInfo({ ...info, _id: qq, sex, groupId, groupNickName, city, qq, subType, messages: [{ time, rawMessage, messageId, groupId }] })
})

//监听群员入群事件
// bot.on("notice.group.increase", (data)=>{
//     bot.sendGroupMsg(data.group_id, data.nickname + " 加入了群");
// });

// login with your password or password_md5
bot.login(password)

//同一事件可以多次监听
//更多api和事件请参考文档或client.d.ts文件
