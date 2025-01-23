import { Context, Dict, Schema } from 'koishi'

async function formatCommas(num: number): Promise<string> {
    return num.toLocaleString();
}

async function formatUnits(value: number): Promise<string> {
    const mbValue = value / 1024 / 1024;
    const gbValue = mbValue / 1024;
    const tbValue = gbValue / 1024;

    if (tbValue >= 1) {
        return `${tbValue.toFixed(2)}TB`;
    } else {
        return `${gbValue.toFixed(2)}GB`;
    }
}

async function getlatestVersion(): Promise<string> {
    try {
        const response = await fetch('https://bd.bangbang93.com/openbmclapi/metric/version');
        const data = await response.json();
        return data.version;
    } catch (error) {
        console.error('Error fetching latest version:', error);
        return '版本获取失败';
    }
}

async function formatMessage(data: any[],show_id: boolean): Promise<string> {
    const messages: string[] = [];

    for (const item of data) {
        const rank = item.rank;
        const metric = item.metric || {};
        const id = item._id;
        const sponsor = item.sponsor || {};
        const sponsorName = sponsor.name || '未知';
        const user = item.user || { name: '未知' };
        const userName = user.name || '未知';
        let version: string;

        try {
            if (item.version === await getlatestVersion()) {
                version = item.version + '🟢';
            } else {
                version = item.version + '🟠';
            }
        } catch (error) {
            version = '版本获取失败';
        }

        const bytesMb = await formatUnits(metric.bytes || 0);
        const hits = await formatCommas(metric.hits || 0);
        const name = item.name;
        const isEnabled = item.isEnabled ? '✅' : '❌';
        if (show_id){
            messages.push(`${isEnabled} ${rank} | ${id} | ${name}\n` +
                `bytes/hits ${bytesMb} | ${hits}\n` +
                `所有者 ${userName} | 赞助商 ${sponsorName}\n` +
                `版本 ${version}`);
        }
        if (!show_id){
            messages.push(`${isEnabled} ${rank} | ${name}\n` +
                `bytes/hits ${bytesMb} | ${hits}\n` +
                `所有者 ${userName} | 赞助商 ${sponsorName}\n` +
                `版本 ${version}`);
        }
    }

    return messages.join('\n');
}

export const name = 'obastatus';
let clusterlist = [];

export interface Config {
    openbmclapi_jwt: string;
}

export const Config: Schema<Config> = Schema.object({
    openbmclapi_jwt: Schema.string().description('请求 API 时使用的鉴权 Token，若不填写将无法获取到部分信息'),
});

async function fetchData(cookies: Dict<string>) {
    try {
        const headers = {
            'Cookie': Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; ')
        };
        const res = await fetch('https://bd.bangbang93.com/openbmclapi/metric/rank', { headers });
        const data = await res.json();
        clusterlist = data;
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

export function apply(ctx: Context, config: Config) {
    fetchData({
        'openbmclapi-jwt': config.openbmclapi_jwt,
    });

    setInterval(() => {
        fetchData({
            'openbmclapi-jwt': config.openbmclapi_jwt,
        });
    }, 30000);
    ctx.command('brrs <cluster_name>' ,'通过节点名称查找节点')
        .action(async (_, cluster_name) => {
            if (!cluster_name) {
                return '请输入节点名称';
            }

            const matchingJsons = clusterlist
                .map((item, idx) => ({ rank: idx + 1, ...item }))
                .filter(item => new RegExp(cluster_name, 'i').test(item.name || ''));

            if (matchingJsons.length === 0) {
                return '未找到节点';
            }
            if (matchingJsons.length >= 1) {
                const unprocessedmessage = await formatMessage(matchingJsons,false);
                const domainRegex = /[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
                const message = unprocessedmessage.replace(domainRegex, '___');
                return `OpenBMCLAPI 2.0-rc.0 \n${message}`;
            }
        });
    
    ctx.command('bmcl' ,'获取面板信息')
        .action(async (_) => {
            const version = await (await fetch('https://bd.bangbang93.com/openbmclapi/metric/version')).json();

            const dashboard = await (await fetch('https://bd.bangbang93.com/openbmclapi/metric/dashboard')).json();

            return `官方版本 ${version.version} | 在线节点数 ${dashboard.currentNodes} 个
负载: ${Math.round(dashboard.load * 100 * 100) / 100}% | 总出网带宽： ${dashboard.bandwidth} Mbps
当前出网带宽：${Math.floor(dashboard.currentBandwidth)} Mbps | 当日请求：${await formatCommas(dashboard.hits)}
数据量：${await formatUnits(dashboard.bytes)} | 请求时间：${new Date().toLocaleString()}`;
        });
    ctx.command('nodeid <clusterid>','通过id查找节点')
      .action(async (_, clusterid) => {
        if (!clusterid) {
          return '请输入节点id';
        }
        const matchingJsons = clusterlist
            .map((item, idx) => ({ rank: idx + 1, ...item }))
            .filter(item => new RegExp(clusterid, 'i').test(item._id || ""));
        if (matchingJsons.length === 0){
            return '未找到节点';
          }
          if (matchingJsons.length >= 1) {
            const unprocessedmessage = await formatMessage(matchingJsons,true);
            const domainRegex = /[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
            const message = unprocessedmessage.replace(domainRegex, '___');
            return `OpenBMCLAPI 2.0-rc.0 \n${message}`;
        }
      });
    ctx.command('top <num>','获取排名前X的节点')
      .action(async (_, num: string='10') => {
        if (!num){
            const num = 10
        }
        let topNum: number;
        topNum = parseInt(num);
        if (topNum <= 0){
            return '参数必须大于0';
          }
        if (topNum > clusterlist.length){
            return '参数不能大于节点数';
        }if (isNaN(topNum)){
            return `参数非int类型`
          }
        const matchingJsons = clusterlist
          .map((item, idx) => ({ rank: idx + 1, ...item }))
          .filter((item, idx) => idx < topNum);
        const unprocessedmessage = await formatMessage(matchingJsons,false);
        const domainRegex = /[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
        const message = unprocessedmessage.replace(domainRegex, '___');
        return `OpenBMCLAPI 2.0-rc.0 \n${message}`;
      });
    ctx.command('rank <num>','获取排名第X的节点')
        .action(async (_,num) =>{
            const IntNum = parseInt(num);
            if (isNaN(IntNum)){
                return '数字非int类型'
            }
            if (IntNum <= 0){
                return '数字不能小于1'
            }
            if (!IntNum){
                return '参数不能为空'
            }
            const rankNum = IntNum - 1
            const clusterData = [
                { ...clusterlist[rankNum], rank: IntNum }
            ];
            const unprocessedmessage = await formatMessage(clusterData,false);
            const domainRegex = /[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
            const message = unprocessedmessage.replace(domainRegex, '___');
            return `OpenBMCLAPI 2.0-rc.0 \n${message}`;

            
        })
}
