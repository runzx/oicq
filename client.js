"use strict";
const version = require("./package.json");
const net = require("net");
const fs = require("fs");
const path = require("path");
const os = require("os");
const {exec} = require("child_process");
const {randomBytes} = require("crypto");
const log4js = require("log4js");
const {getApkInfo, getDeviceInfo} = require("./device");
const {checkUin, timestamp, md5} = require("./lib/common");
const core = require("./lib/core");
const frdlst = require("./lib/friendlist");
const sysmsg = require("./lib/sysmsg");
const wt = require("./lib/wtlogin/wt");
const chat = require("./lib/message/chat");
const indi = require("./lib/individual");
const troop = require("./lib/troop");
const {getErrorMessage, TimeoutError} = require("./exception");
const BUF0 = Buffer.alloc(0);

function buildApiRet(retcode, data = null, error = null) {
    data = data ? data : null;
    error = error ? error : null;
    const status = retcode ? (retcode===1?"async":"failed") : "ok";
    return {
        retcode, data, status, error
    };
}

class Client extends net.Socket {
    static OFFLINE = Symbol("OFFLINE");
    static INIT = Symbol("INIT");
    static ONLINE = Symbol("ONLINE");
}
class AndroidClient extends Client {
    logining = false;
    status = Client.OFFLINE;
    nickname = "";
    age = 0;
    sex = "unknown";
    online_status = 0;
    fl = new Map; //friendList
    sl = new Map; //strangerList
    gl = new Map; //groupList
    gml = new Map; //groupMemberList

    recv_timestamp = 0;
    send_timestamp = 0xffffffff;
    heartbeat = null;
    seq_id = 0;
    handlers = new Map;
    seq_cache = new Map;

    session_id = randomBytes(4);
    random_key = randomBytes(16);

    sig = {
        srm_token: BUF0,
        tgt: BUF0,
        tgt_key: BUF0,
        st_key: BUF0,
        st_web_sig: BUF0,
        skey: BUF0,
        d2: BUF0,
        d2key: BUF0,
        sig_key: BUF0,
        ticket_key: BUF0,
        device_token: BUF0,
        emp_time: timestamp(),
    };
    cookies = {};

    sync_finished = false;
    sync_cookie;
    const1 = randomBytes(4).readUInt32BE();
    const2 = randomBytes(4).readUInt32BE();
    const3 = randomBytes(1)[0];
    var4 = 0;

    stat = {
        start_time: timestamp(),
        lost_times: 0,
        recv_pkt_cnt: 0,
        sent_pkt_cnt: 0,
        lost_pkt_cnt: 0,
        recv_msg_cnt: 0,
        sent_msg_cnt: 0,
    };

    constructor(uin, config) {
        super();
        this.uin = uin;

        config = {
            platform: 1,
            log_level: "info",
            kickoff: false,
            ignore_self: true,
            resend: true,
            reconn_interval: 5,
            slider: true,
            data_dir: path.join(process.mainModule.path, "data"),
            ...config
        };
        this.config = config;
        this.dir = createDataDir(config.data_dir, uin);
        this.logger = log4js.getLogger(`[BOT:${uin}]`);
        this.logger.level = config.log_level;

        this.logger.info(`----------`);
        this.logger.info(`Package Version: oicq@${version.version} (Released on ${version.upday})`);
        this.logger.info("View Changelogs：https://github.com/takayama-lily/oicq/releases");
        this.logger.info(`----------`);

        const filepath = path.join(this.dir, `device-${uin}.json`);
        if (!fs.existsSync(filepath))
            this.logger.info("创建了新的设备文件：" + filepath);
        this.device = getDeviceInfo(filepath);
        this.apk = getApkInfo(config.platform);
        this.ksid = Buffer.from(`|${this.device.imei}|` + this.apk.name);

        this.on("error", (err)=>{
            this.logger.error(err.message);
        });
        this.on("close", ()=>{
            this.read();
            if (this.remoteAddress)
                this.logger.info(`${this.remoteAddress}:${this.remotePort} closed`);
            this.stopHeartbeat();
            if (this.status === Client.OFFLINE) {
                return this.emit("internal.wt.failed", "网络不通畅。");
            } else if (this.status === Client.ONLINE) {
                ++this.stat.lost_times;
                this.logining = true;
                setTimeout(()=>{
                    this._connect(this.register.bind(this));
                }, 50);
            }
            this.status = Client.OFFLINE;
        });
        this.on("readable", ()=>{
            while (this.readableLength > 4) {
                let len_buf = this.read(4);
                let len = len_buf.readInt32BE();
                if (this.readableLength >= len - 4) {
                    this.recv_timestamp = Date.now();
                    const packet = this.read(len - 4);
                    ++this.stat.recv_pkt_cnt;
                    try {
                        core.parseIncomingPacket.call(this, packet);
                    } catch (e) {
                        this.logger.debug(e.stack);
                        this.em("internal.exception", e);
                    }
                } else {
                    this.unshift(len_buf);
                    break;
                }
            }
        });

        this.on("internal.login", async()=>{
            this.logger.info(`Welcome, ${this.nickname} ! 开始初始化资源...`);
            this.sync_finished = false;
            await this.register();
            if (!this.isOnline())
                return;
            await Promise.all([
                frdlst.initFL.call(this),
                frdlst.initGL.call(this)
            ]);
            this.logger.info(`加载了${this.fl.size}个好友，${this.gl.size}个群。`);
            this.sync_finished = true;
            this.logger.info("初始化完毕，开始处理消息。");
            core.getMsg.call(this);
            this.em("system.online");
        });

        this.on("internal.wt.failed", (message)=>{
            this.logining = false;
            this.logger.error(message);
            if (this.status !== Client.OFFLINE)
                this.terminate();
            if (this.config.reconn_interval >= 1) {
                this.logger.warn(this.config.reconn_interval + "秒后重新连接。");
                setTimeout(this.login.bind(this), this.config.reconn_interval * 1000);
            }
            this.em("system.offline.network", {message});
        });
    }

    _connect(callback = ()=>{}) {
        if (this.status !== Client.OFFLINE) {
            return callback();
        }
        let ip = "msfwifi.3g.qq.com", port = 8080;
        if (net.isIP(this.config.remote_ip))
            ip = this.config.remote_ip;
        if (this.config.remote_port > 0 && this.config.remote_port < 65536)
            port = this.config.remote_port;
        this.logger.info(`connecting to ${ip}:${port}`);
        this.removeAllListeners("connect");
        this.connect(port, ip, ()=>{
            this.status = Client.INIT;
            this.logger.info(`${this.remoteAddress}:${this.remotePort} connected`);
            this.resume();
            callback();
        });
    }

    nextSeq() {
        if (++this.seq_id >= 0x8000)
            this.seq_id = 1;
        return this.seq_id;
    }

    async send(packet, timeout = 5000) {
        ++this.stat.sent_pkt_cnt;
        const seq_id = this.seq_id;
        return new Promise((resolve, reject)=>{
            this.write(packet, ()=>{
                const id = setTimeout(()=>{
                    this.handlers.delete(seq_id);
                    ++this.stat.lost_pkt_cnt;
                    reject(new TimeoutError());
                    this.em("internal.timeout", {seq_id});
                }, timeout);
                this.handlers.set(seq_id, (data)=>{
                    clearTimeout(id);
                    this.handlers.delete(seq_id);
                    resolve(data);
                });
            });
        });
    }
    writeUNI(cmd, body, seq) {
        ++this.stat.sent_pkt_cnt;
        this.write(wt.build0x0BPacket.apply(this, arguments));
    }
    async sendUNI(cmd, body, seq) {
        return await this.send(wt.build0x0BPacket.apply(this, arguments));
    }

    startHeartbeat() {
        if (this.heartbeat)
            return;
        this.heartbeat = setInterval(async()=>{
            this.doCircle();
            try {
                if (!this.isOnline())
                    return;
                await wt.heartbeat.call(this);
                if (Date.now() - this.send_timestamp >= 59000) {
                    if (!await core.getMsg.call(this) && this.isOnline()) {
                        this.logger.warn("GetMsg timeout!");
                        if (!await core.getMsg.call(this) && this.isOnline())
                            this.destroy();
                    }
                }
            } catch {
                if (!this.isOnline())
                    return;
                core.getMsg.call(this);
                try {
                    await wt.heartbeat.call(this);
                } catch {
                    this.logger.warn("Heartbeat timeout!");
                    if (Date.now() - this.recv_timestamp > 6000 && this.isOnline())
                        this.destroy();
                }
            }
        }, 30000);
    }
    stopHeartbeat() {
        clearInterval(this.heartbeat);
        this.heartbeat = null;
    }

    async register() {
        this.logining = true;
        try {
            if (!await wt.register.call(this)) {
                await fs.promises.unlink(path.join(this.dir, "token"));
                throw new Error();
            }
        } catch (e) {
            return this.emit("internal.wt.failed", "register失败。");
        }
        this.status = Client.ONLINE;
        this.logining = false;
        if (!this.online_status)
            this.online_status = 11;
        this.setOnlineStatus(this.online_status);
        this.startHeartbeat();
        if (!this.listenerCount("internal.kickoff")) {
            this.once("internal.kickoff", (data)=>{
                this.status = Client.INIT;
                this.stopHeartbeat();
                this.logger.warn(data.info);
                let sub_type;
                if (data.info.includes("一台")) {
                    sub_type = "kickoff";
                    if (this.config.kickoff) {
                        this.logger.warn("3秒后重新连接..");
                        setTimeout(this.login.bind(this), 3000);
                    } else {
                        this.terminate();
                    }
                } else if (data.info.includes("冻结") || data.info.includes("泄露")) {
                    sub_type = "frozen";
                    this.terminate();
                } else if (data.info.includes("设备锁")) {
                    sub_type = "device";
                    this.terminate();
                } else {
                    sub_type = "unknown";
                    this.logger.warn("3秒后重新连接..");
                    setTimeout(this.login.bind(this), 3000);
                }
                this.em("system.offline." + sub_type, {message: data.info});
            });
        }
        await core.getMsg.call(this);
    }

    /**
     * @param {Function} fn 
     * @param {Array} params 
     */
    async useProtocol(fn, params) {
        if (!this.isOnline() || !this.sync_finished)
            return buildApiRet(104, null, {code: -1, message: "bot not online"});
        try {
            const rsp = await fn.apply(this, params);
            if (!rsp)
                return buildApiRet(1);
            if (rsp.result !== 0)
                return buildApiRet(102, null,
                    {
                        code: rsp.result,
                        message: rsp.emsg?rsp.emsg:getErrorMessage(fn, rsp.result)
                    }
                );
            else
                return buildApiRet(0, rsp.data);
        } catch (e) {
            if (e instanceof TimeoutError)
                return buildApiRet(103, null, {code: -1, message: "packet timeout"});
            this.logger.debug(e);
            return buildApiRet(100, null, {code: -1, message: e.message});
        }
    }

    em(name, data = {}) {
        const slice = name.split(".");
        const post_type = slice[0], sub_type = slice[2];
        const param = {
            self_id:    this.uin,
            time:       timestamp(),
            post_type:  post_type
        };
        const type_name = slice[0] + "_type";
        param[type_name] = slice[1];
        if (sub_type)
            param.sub_type = sub_type;
        Object.assign(param, data);
        const lv2_event = post_type + "." + slice[1];
        if (this.listenerCount(name))
            this.emit(name, param);
        else if (this.listenerCount(lv2_event))
            this.emit(lv2_event, param);
        else
            this.emit(post_type, param);
    }

    msgExists(from, type, seq, time) {
        if (timestamp() - time >= 60)
            return true;
        const id = [from, type, seq].join("-");
        const set = this.seq_cache.get(time);
        if (!set) {
            this.seq_cache.set(time, new Set([id]));
            return false;
        } else {
            if (set.has(id))
                return true;
            else
                set.add(id);
            return false;
        }
    }
    doCircle() {
        wt.exchangeEMP.call(this);
        if (this.config.platform != 2 && this.config.platform != 3 &&this.var4++ > 10) {
            this.setOnlineStatus(this.online_status);
            this.var4 = 0;
        }
        for (let time of this.seq_cache.keys()) {
            if (timestamp() - time >= 60)
                this.seq_cache.delete(time);
            else
                break;
        }
    }
    calcMsgCnt() {
        let cnt = 0;
        for (let [time, set] of this.seq_cache) {
            if (timestamp() - time >= 60)
                this.seq_cache.delete(time);
            else
                cnt += set.size;
        }
        return cnt;
    }

    // 以下是public方法 ----------------------------------------------------------------------------------------------------

    login(password) {
        if (this.isOnline() || this.logining)
            return;
        if (password || !this.password_md5) {
            if (password === undefined)
                throw new Error("No password input.");
            if (typeof password === "string")
                var password_md5 = Buffer.from(password, "hex");
            else if (password instanceof Buffer || password instanceof Uint8Array)
                var password_md5 = Buffer.from(password);
            if (password_md5 && password_md5.length === 16)
                this.password_md5 = password_md5;
            else
                this.password_md5 = md5(String(password));
        }
        this._connect(()=>{
            wt.passwordLogin.call(this);
        });
    }

    captchaLogin(captcha) {
        if (!this.captcha_sign)
            return this.logger.warn("未收到图片验证码或已过期，你不能调用captchaLogin函数。");
        this._connect(()=>{
            wt.captchaLogin.call(this, captcha);
        });
    }

    sliderLogin(ticket) {
        if (!this.t104)
            return this.logger.warn("未收到滑动验证码或已过期，你不能调用sliderLogin函数。");
        this._connect(()=>{
            wt.sliderLogin.call(this, ticket);
        });
    }

    terminate() {
        if (this.status === Client.ONLINE)
            this.status = Client.INIT;
        this.destroy();
    }

    async logout() {
        if (this.isOnline()) {
            try {
                await wt.register.call(this, true);
            } catch {}
        }
        this.terminate();
    }

    isOnline() {
        return this.status === Client.ONLINE;
    }

    async setOnlineStatus(status) {
        return await this.useProtocol(indi.setStatus, arguments);
    }

    getFriendList() {
        return buildApiRet(0, this.fl);
    }
    getStrangerList() {
        return buildApiRet(0, this.sl);
    }
    getGroupList() {
        return buildApiRet(0, this.gl);
    }

    async reloadFriendList() {
        const ret = await this.useProtocol(frdlst.initFL, arguments);
        this.sync_finished = true;
        core.getMsg.call(this);
        return ret;
    }
    async reloadGroupList() {
        const ret = await this.useProtocol(frdlst.initGL, arguments);
        this.sync_finished = true;
        core.getMsg.call(this);
        return ret;
    }

    async getGroupMemberList(group_id, no_cache = false) {
        return await this.useProtocol(frdlst.getGML, arguments);
    }
    async getStrangerInfo(user_id, no_cache = false) {
        return await this.useProtocol(frdlst.getSI, arguments);
    }
    async getGroupInfo(group_id, no_cache = false) {
        return await this.useProtocol(frdlst.getGI, arguments);
    }
    async getGroupMemberInfo(group_id, user_id, no_cache = false) {
        return await this.useProtocol(frdlst.getGMI, arguments);
    }

    ///////////////////////////////////////////////////

    async sendPrivateMsg(user_id, message = "", auto_escape = false) {
        return await this.useProtocol(chat.sendMsg, [user_id, message, auto_escape, 0]);
    }
    async sendGroupMsg(group_id, message = "", auto_escape = false) {
        return await this.useProtocol(chat.sendMsg, [group_id, message, auto_escape, 1]);
    }
    async sendDiscussMsg(discuss_id, message = "", auto_escape = false) {
        return await this.useProtocol(chat.sendMsg, [discuss_id, message, auto_escape, 2]);
    }
    async deleteMsg(message_id) {
        return await this.useProtocol(chat.recallMsg, arguments);
    }
    async getMsg(message_id) {
        return await this.useProtocol(chat.getHistoryMsg, arguments);
    }

    ///////////////////////////////////////////////////

    async setGroupAnonymousBan(group_id, flag, duration = 1800) {
        return await this.useProtocol(troop.muteAnonymous, arguments);
    }
    async setGroupAnonymous(group_id, enable = true) {
        return await this.useProtocol(troop.setAnonymous, arguments);
    }
    async setGroupWholeBan(group_id, enable = true) {
        return await this.setGroupSetting(group_id, "shutupTime", enable?0xffffffff:0);
    }
    async setGroupName(group_id, group_name) {
        return await this.setGroupSetting(group_id, "ingGroupName", String(group_name));
    }
    async sendGroupNotice(group_id, content) {
        return await this.setGroupSetting(group_id, "ingGroupMemo", String(content));
    }
    async setGroupSetting(group_id, k, v) {
        return await this.useProtocol(troop.doSetting, arguments);
    }
    async setGroupAdmin(group_id, user_id, enable = true) {
        return await this.useProtocol(troop.setAdmin, arguments);
    }
    async setGroupSpecialTitle(group_id, user_id, special_title = "", duration = -1) {
        return await this.useProtocol(troop.setTitle, arguments);
    }
    async setGroupCard(group_id, user_id, card = "") {
        return await this.useProtocol(troop.setCard, arguments);
    }
    async setGroupKick(group_id, user_id, reject_add_request = false) {
        return await this.useProtocol(troop.kickMember, arguments);
    }
    async setGroupBan(group_id, user_id, duration = 1800) {
        return await this.useProtocol(troop.muteMember, arguments);
    }
    async setGroupLeave(group_id, is_dismiss = false) {
        return await this.useProtocol(troop.quitGroup, arguments);
    }
    async sendGroupPoke(group_id, user_id) {
        return await this.useProtocol(troop.pokeMember, arguments);
    }

    ///////////////////////////////////////////////////

    async setFriendAddRequest(flag, approve = true, remark = "", block = false) {
        return await this.useProtocol(sysmsg.friendAction, arguments);
    }
    async setGroupAddRequest(flag, approve = true, reason = "", block = false) {
        return await this.useProtocol(sysmsg.groupAction, arguments);
    }

    async addGroup(group_id, comment = "") {
        return await this.useProtocol(troop.addGroup, arguments);
    }
    async addFriend(group_id, user_id, comment = "") {
        return await this.useProtocol(indi.addFriend, arguments);
    }
    async deleteFriend(user_id, block = true) {
        return await this.useProtocol(indi.delFriend, arguments);
    }
    async inviteFriend(group_id, user_id) {
        return await this.useProtocol(troop.inviteFriend, arguments);
    }

    async sendLike(user_id, times = 1) {
        return await this.useProtocol(indi.sendLike, arguments);
    }
    async setNickname(nickname) {
        return await this.useProtocol(indi.setProfile, [0x14E22, String(nickname)]);
    }
    async setDescription(description = "") {
        return await this.useProtocol(indi.setProfile, [0x14E33, String(description)]);
    }
    async setGender(gender) {
        gender = parseInt(gender);
        if (![0,1,2].includes(gender))
            return buildApiRet(100);
        return await this.useProtocol(indi.setProfile, [0x14E29, Buffer.from([gender])]);
    }
    async setBirthday(birthday) {
        try {
            birthday = String(birthday).replace(/[^\d]/g, "");
            const buf = Buffer.alloc(4);
            buf.writeUInt16BE(parseInt(birthday.substr(0, 4)));
            buf.writeUInt8(parseInt(birthday.substr(4, 2)), 2);
            buf.writeUInt8(parseInt(birthday.substr(6, 2)), 3);
            return await this.useProtocol(indi.setProfile, [0x16593, buf]);
        } catch (e) {
            return buildApiRet(100);
        }
    }
    async setSignature(signature = "") {
        return await this.useProtocol(indi.setSign, arguments);
    }
    async setPortrait(file) {
        return await this.useProtocol(indi.setPortrait, arguments);
    }
    async setGroupPortrait(group_id, file) {
        return await this.useProtocol(indi.setGroupPortrait, arguments);
    }

    ///////////////////////////////////////////////////

    async getCookies(domain) {
        await wt.exchangeEMP.call(this);
        if (domain && !this.cookies[domain])
            return buildApiRet(100, null, {code: -1, message: "unknown domain"});
        let cookies = `uin=o${this.uin}; skey=${this.sig.skey};`;
        if (domain)
            cookies = `${cookies} p_uin=o${this.uin}; p_skey=${this.cookies[domain]};`;
        return buildApiRet(0, {cookies});
    }

    async getCsrfToken() {
        await wt.exchangeEMP.call(this);
        let token = 5381;
        for (let v of this.sig.skey)
            token = token + (token << 5) + v;
        token &= 2147483647;
        return buildApiRet(0, {token});
    }

    /**
     * @param {String} type "image" or "record" or undefined
     */
    async cleanCache(type = "") {
        switch (type) {
            case "image":
            case "record":
                const file = path.join(this.dir, "..", type, "*");
                const cmd = os.platform().includes("win") ? `del /q ` : `rm -f `;
                exec(cmd + file, (err, stdout, stderr)=>{
                    if (err)
                        return this.logger.error(err);
                    if (stderr)
                        return this.logger.error(stderr);
                    this.logger.info(type + " cache clear");
                });
                break;
            case "":
                this.cleanCache("image");
                this.cleanCache("record");
                break;
            default:
                return buildApiRet(100, null, {code:-1, message:"unknown type (image, record, or undefined)"});
        }
        return buildApiRet(1);
    }

    canSendImage() {
        return buildApiRet(0, {yes: true});
    }
    canSendRecord() {
        return buildApiRet(0, {yes: true});
    }
    getVersionInfo() {
        return buildApiRet(0, version);
    }
    getStatus() {
        return buildApiRet(0, {
            online: this.isOnline(),
            status: this.online_status,
            remote_ip: this.remoteAddress,
            remote_port: this.remotePort,
            msg_cnt_per_min: this.calcMsgCnt(),
            statistics: this.stat,
            config: this.config
        })
    }
    getLoginInfo() {
        return buildApiRet(0, {
            user_id: this.uin,
            nickname: this.nickname,
            age: this.age, sex: this.sex
        })
    }
}

/**
 * @deprecated
 */
const logger = log4js.getLogger("[SYSTEM]");
logger.level = "info";
process.OICQ = {
    logger
};

function createDataDir(dir, uin) {
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, {mode: 0o755, recursive: true});
    const img_path = path.join(dir, "image");
    const ptt_path = path.join(dir, "record");
    const uin_path = path.join(dir, String(uin));
    if (!fs.existsSync(img_path))
        fs.mkdirSync(img_path);
    if (!fs.existsSync(ptt_path))
        fs.mkdirSync(ptt_path);
    if (!fs.existsSync(uin_path))
        fs.mkdirSync(uin_path, {mode: 0o755});
    return uin_path;
}

/**
 * @deprecated
 */
function setGlobalConfig() {}

//----------------------------------------------------------------------------------------------------

/**
 * @param {Number} uin 
 * @param {JSON} config 
 * @returns {AndroidClient}
 */
function createClient(uin, config = {}) {
    uin = parseInt(uin);
    if (!checkUin(uin))
        throw new Error("Argument uin is not an OICQ account.");
    return new AndroidClient(uin, config);
}

module.exports = {
    createClient, setGlobalConfig
};
