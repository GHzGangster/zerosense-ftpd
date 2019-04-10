var zero = require('zerosense');
var Util = require('zerosense/Util');

var Net = require('./Net.js');
var NetUtil = require('./NetUtil.js');


class Session {
	
	constructor(bufferAddr, bufferSize) {
		this.bufferAddr = bufferAddr;
		this.bufferSize = bufferSize;
		
		this.s_client = -1;
		this.s_data = -1;
		this.s_pasv = -1;
		
		this.cwd = "/";
	}
	
	open(s_client) {
		this.s_client = s_client;
	}
	
	close() {
		if (this.s_data !== -1) {
			NetUtil.sclose(this.s_data);
			this.s_data = -1;
		}
		if (this.s_pasv !== -1) {
			NetUtil.sclose(this.s_pasv);
			this.s_pasv = -1;
		}
		if (this.s_client !== -1) {
			NetUtil.sclose(this.s_client);
			this.s_client = -1;
		}
	}
	
	openData(s_data) {
		this.s_data = s_data;
	}
	
	closeData() {
		if (this.s_data !== -1) {
			NetUtil.sclose(this.s_data);
			this.s_data = -1;
		}
	}
	
	sendStr(str) {
		var bufStr = Util.ascii(str);
		Net.sys_net_bnet_sendto(this.s_client, bufStr, str.length, 0, 0, 0);
		zero.logger.debug(str);
	}
	
	sendStrData(str) {
		var bufStr = Util.ascii(str);
		Net.sys_net_bnet_sendto(this.s_data, bufStr, str.length, 0, 0, 0);
	}
	
	recvStr(maxLength) {
		var _len = maxLength;
		if ((_len % 2) !== 0) {
			_len += 1;
		}
		var buf = zero.memoryReader.read(this.bufferAddr, _len);
		var bufstr = Util.getascii(buf, 0, _len);
		return bufstr;
	}
	
}


module.exports = Session;