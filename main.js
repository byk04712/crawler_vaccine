/**
 * 自动轮巡获取佛上市各个区域下的各个可接种疫苗的情况
 * 
 * https://fsservice.wjj.foshan.gov.cn/fw/content/wxOrder/index.html?state=ch5#/appoint/organizationlist?bookType=personal
 */

require('colors');
const fetch = require('node-fetch');
const schedule = require('node-schedule');


// 简化 fetch 请求调用
const httpRequest = (url, { method = 'POST', params = {} }) =>
	new Promise((resolve, reject) => 
		fetch(url, {
			method,
		  headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(params),
		})
			.then(res => res.json())
			.then(resolve)
			.catch(reject)
	);


// =========================== 爬虫 START ===========================
const Crawler = (() => {
	// 佛山市可接种疫苗的区域街道
	const groupAreaMap = new Map([
		['禅城区', ['石湾街道', '张槎街道', '祖庙街道', '南庄镇']],
		['南海区', ['桂城街道', '九江镇', '西樵镇', '丹灶镇', '狮山镇', '大沥镇', '里水镇']],
		['顺德区', ['大良街道', '容桂街道', '伦教街道', '勒流街道', '陈村镇', '均安镇', '杏坛镇', '龙江镇', '乐从镇', '北滘镇']],
		['三水区', ['西南街道', '云东海街道', '大塘镇', '乐平镇', '白坭镇', '芦苞镇', '南山镇']],
		['高明区', ['荷城街道', '杨和镇', '明城镇', '更合镇']],
	]);
	// 根据区域街道获取疫苗信息
	const getOrganizeByGroupArea = 'https://fsservice.wjj.foshan.gov.cn/fw2/foying/wechatpublic/wx/userBooking/getOrganizeByGroupArea'
	// 根据医院机构id，日期时间 获取疫苗排班列表
	// const getScheduleFullForShow = 'https://fsservice.wjj.foshan.gov.cn/fw2/foying/wechatpublic/wx/userBooking/getScheduleFullForShow'
	// 根据医院机构id，日期时间 获取疫苗接种时间节点
	const getScheduleByDate = 'https://fsservice.wjj.foshan.gov.cn/fw2/foying/wechatpublic/wx/userBooking/getScheduleByDate';
	// 睡眠
	const sleep = (timeout = 3000) => new Promise(resolve => setTimeout(resolve, timeout));

	// 获取 区域，街道
	function getAreaStreet() {
		const organizeList = [];
		for (let [groupArea, groupStreetList] of groupAreaMap) {
		  for (let groupStreet of groupStreetList) {
		  	organizeList.push({
		    	groupArea,
		    	groupStreet,
		  	});
		  }
		}
		return organizeList;
	}

	// 根据区域，街道获取接种点
	function getOrganizeByAreaStreet(area, street) {
		return new Promise((resolve, reject) => {
			httpRequest(getOrganizeByGroupArea,
				{
		  		params: {
			    	groupArea: area,
			    	groupStreet: street,
		    	},
		  	})
			.then(res => {
				if (res.ResCode === '100') {
					const organizeList = res.entityList.map(e => ({ ...e, area, street }));
					return resolve(organizeList);
				}
				return reject(res.ResMsg);
			})
			.catch();
		});
	}

	// 根据接种点id，和日期获取排班时间
	function getSchedule(baseOrganizeID, scheduleDate) {
		return new Promise((resolve, reject) => {
			httpRequest(getScheduleByDate, {
				params: {
					baseOrganizeID,
					scheduleDate,
				},
			})
				.then(res => {
					if (res.ResCode !== '100') return reject(res.ResMsg);
					return resolve(res.entityList);
				})
				.catch();
		});
	}

	// 运行
	async function run() {
		const areaStreet = getAreaStreet();
		for (let { groupArea, groupStreet } of areaStreet) {
			// 每次休眠一会儿
			await sleep(2000);
			try {
				const organizeList = await getOrganizeByAreaStreet(groupArea, groupStreet);
				// 获取指定区域的指定街道下的接种点
				// console.log(`${groupArea} ${groupStreet} `, organizeList);
				// 遍历 区域 -> 街道 -> 接种点是否有可预约的数据
				for (let { id, area, street, organizeName } of organizeList) {
					await sleep(1500);
					// 最近一周
					for (let scheduleDate of recentlyDate()) {
						await sleep(2000);
						try {
							const scheduleList = await getSchedule(id, scheduleDate);
							// 查询到有可预约就立即调用企业微信发送消息
							const availableList = scheduleList.filter(e => e.count > 4); // 过滤下，大于 n 剂时才提示。
							console.log(`${area}  ${street}  ${organizeName}\t${scheduleDate} 有 ${String(` ${scheduleList.length} `).inverse} 个排班 \t可预约的疫苗 ${String(` ${availableList.length} `).inverse} 剂`);
							if (availableList.length) {
								const scheduleInfo = {
									area,
									street,
									organizeName,
									scheduleDate,
									scheduleList: availableList,
								};
								notify(scheduleInfo);
							}
						} catch(e) {
							console.log(`${area}  ${street}  ${organizeName}\t${scheduleDate}\t`, e.red);
						}
					}
				}
			} catch(e) {
				// 查询不到机构列表
				console.log(`${groupArea}  ${groupStreet}\t`, e.red);
			}
		}
	}

	// 未来几天日期
	function recentlyDate(fetureDays = 6) {
		// 补零
		const appendZero = n => `0${n}`.slice(-2);
		// 今天
		const today = new Date();
		const [y, m, d] = [today.getFullYear(), appendZero(today.getMonth() + 1), appendZero(today.getDate())];
		const ret = [`${y}-${m}-${d}`];
		// 获取未来几天
		for (let i = 1; i <= fetureDays; i++) {
			const day = new Date(today.getTime());
			day.setDate(day.getDate() + i);
			const [nextY, nextM, nextD] = [day.getFullYear(), appendZero(day.getMonth() + 1), appendZero(day.getDate())];
			ret.push(`${nextY}-${nextM}-${nextD}`);
		}
		return ret;
	}

	return {
		run,
	};
})();
// =========================== 爬虫 START ===========================










// =========================== 企业微信机器人 START ===========================
const WechatRobot = (() => {
	const ROBOT_KEY = 'd9323df8-930e-467b-9253-4db62f2dd1aa'; // 追梦赤子心 - 技术部 (个人测试用)

	function sendMarkdownMsg(content) {
		return httpRequest(`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${ROBOT_KEY}`, {
			params: {
				msgtype: 'markdown',
				markdown: {
					content,
				},
			},
		});
	}

	return {
		sendMarkdownMsg,
	};
})();
// =========================== 企业微信机器人 END   ===========================








// =========================== 程序入口 ===========================
// 每5分钟爬一次
schedule.scheduleJob('0/5 * * * *', function(fireDate) {
	console.log(`============== 执行查询时间：${fireDate.toLocaleTimeString()} ==============`.grey);
	Crawler.run()
		.then(() => {
			console.log(`============== 本次查询任务完成 ==============\n`.grey);
		})
		.finally(() => {
			// process.exit(0);
		});
});



// 通知
function notify(scheduleInfo) {
	const {
		area,
		street,
		organizeName,
		scheduleDate,
		scheduleList,
	} = scheduleInfo;
	const content = scheduleList
		.map(({
			beginTimeStr,
			endTimeStr,
			count,
			vaccineProducer,
		}) => `><font color=\"warning\">${area} - ${street}\n${organizeName}</font>\n时间：${scheduleDate} ${beginTimeStr} - ${endTimeStr}\n剩余<font color=\"info\"> **${count}** </font>剂疫苗`)
	  .join('\n>\n');
	WechatRobot.sendMarkdownMsg(`公众号：[魅力北滘](https://fsservice.wjj.foshan.gov.cn/fw/content/wxOrder/index.html?state=ch5#/appoint/organizationlist?bookType=personal) 有疫苗可以预约啦。\n${content}\n\n\n<font color=\"comment\">机不可失，赶快去公众号看看吧!</font>`)
		.then(res => {
			if (res.errcode === 0) {
				console.log('已通过企业微信机器人通知'.rainbow);
			}
		});
}
