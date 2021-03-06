/*
 * name: base
 * version: 3.2.0
 * update: 增加url对象，支持get和set方法
 * date: 2017-01-23
 */
define('base', function(require, exports, module) {
	'use strict';
	var $ = require('jquery');
	var getUID = function() {
        var maxId = 65536;
        var uid = 0;
        return function() {
            uid = (uid + 1) % maxId;
            return uid;
        };
    } ();
    var getUUID = function(len) {
        len = len || 6;
        len = parseInt(len, 10);
        len = isNaN(len) ? 6: len;
        var seed = "0123456789abcdefghijklmnopqrstubwxyzABCEDFGHIJKLMNOPQRSTUVWXYZ";
        var seedLen = seed.length - 1;
        var uuid = "";
        while (len--) {
            uuid += seed[Math.round(Math.random() * seedLen)];
        }
        return uuid;
    };
	/*
	 * ajax优化
	 */
	var ajaxLocalCacheQueue = {};
	var _ajaxSetup = function(jQuery){
		var catchAjaxError = function(event, request, settings) {
			if(request.statusText === "canceled"){
				return null;
			}
			require.async('box', function() {
				var errmsg = '';
				switch (request.readyState) {
					case 0:
						errmsg = '网络错误，请检查网络连接！';
					break;
					case 1:
						errmsg = '请求异常中断！';
					break;
					case 2:
						errmsg = '数据接收错误！';
					break;
					case 3:
						errmsg = '数据解析错误！';
					break;
					case 4:
						errmsg = '服务端错误！';
					break;
					default:
						errmsg = '未知错误！';
				}
				$.box.msg(errmsg, {
					color: 'danger'
				});
				console.warn(errmsg + 'url: ' + settings.url + '; status: '+ request.status);
			});
		};
		jQuery.ajaxSetup({
			beforeSend: function(xhr, setting) {
				var tempSuccess = setting.success;
				//默认数据类型
				if (!setting.dataType) {
					if(_browser.ie && _browser.ie<=9){
						//ie8\9开启跨域
						if(setting.url.indexOf(window.location.host)<0){
							$.support.cors = true;
						}
					}
					setting.dataType = 'json';
				}
				//默认回调处理
				if (setting.dataType === 'json') {
					setting.success = function(res) {
						//某些环境json数据不能正确解析
						if(res.split){
							res = $.parseJSON(res);
						}
						if (res.msg) {
							require.async('box', function() {
								$.box.msg(res.msg, {
									color: res.status === 'Y' ? 'success' : 'danger',
									delay: 2000,
									onclose: function() {
										tempSuccess(res, res.status !== 'Y');
									}
								});
							});
						} else {
							typeof tempSuccess === 'function' && tempSuccess(res, res.status !== 'Y');
						}
					};
				}
				//默认超时时间
				if (!setting.timeout) {
					setting.timeout = seajs.set.util.timeout || 1.5e4;
				}
				//数据缓存
				if (window.localStorage && setting.localCache !== void(0)) {
					var cacheKey,
						cacheNameSep = ['|','^','@','+','$'],
						cacheNamePrefix = '_ajaxcache',
						cacheName,
						cacheDeadline,
						cacheVal,
						isDebug = _getUrlParam('debug');
					//获取url
					if (setting.type.toUpperCase() === 'POST' && $.isPlainObject(setting.data)) {
						var _param = '?';
						$.each(function(i, e) {
							_param += (i + '=' + e + '&');
						});
						cacheKey = setting.url + _param.slice(-1);
						_param = null;
					} else {
						cacheKey = setting.url;
					}
					//请求队列
					if(ajaxLocalCacheQueue[cacheKey]){
						ajaxLocalCacheQueue[cacheKey].push(setting.success);
						xhr.ignoreError = true;
						return xhr.abort();
					}
					//间隔符容错
					$.each(cacheNameSep,function(i,sep){
						if(cacheKey.indexOf(sep)===-1){
							cacheNameSep = sep;
							return false;
						}
					});
					if(!cacheNameSep.split){
						return console.log('url('+cacheKey+')包含异常字符无法缓存');
					}
					//查找缓存
					$.each(localStorage, function(key, val) {
						if (key.indexOf([cacheNamePrefix, cacheKey].join(cacheNameSep)) === 0) {
							cacheName = key;
							cacheDeadline = key.split(cacheNameSep)[2];
							cacheVal = val;
							return false;
						}
					});
					if (!isDebug && setting.localCache && !isNaN(setting.localCache)) {
						var nowDate = new Date().getTime();
						if (cacheDeadline && cacheDeadline > nowDate) {
							//console.log('使用缓存 '+cacheDeadline+'>'+nowDate);
							if (setting.dataType === 'json') {
								cacheVal = $.parseJSON(cacheVal);
							}
							if (typeof setting.success === 'function') {
								setting.success(cacheVal);
								return false;
							}
						} else {
							if (cacheDeadline && cacheDeadline <= nowDate) {
								//console.log('缓存过期');
								localStorage.removeItem(cacheName);
							}
							//console.log('建立缓存');
							ajaxLocalCacheQueue[cacheKey] = [setting.success];
							setting.success = function(res) {
								var newDeadline = new Date().getTime() + setting.localCache,
									newCacheName = [cacheNamePrefix, cacheKey, newDeadline].join(cacheNameSep);
								$.each(ajaxLocalCacheQueue[cacheKey],function(i,cb){
									typeof cb === 'function' && cb(res);
								});
								delete ajaxLocalCacheQueue[cacheKey];
								//缓存数据
								if ($.isPlainObject(res) || $.isArray(res)) {
									if (window.JSON) {
										res = JSON.stringify(res);
									}
								}
								localStorage.setItem(newCacheName, res);
								newDeadline = null;
								newCacheName = null;
							};
						}
						nowDate = null;
					} else if(cacheName){
						//清除缓存
						localStorage.removeItem(cacheName);
						if(isDebug){
							console.log('debug模式：数据['+cacheName+']已清除');
						}
					}
				}
			}
		});
		$( document ).ajaxError(catchAjaxError);
	};
	/*
	 * cookie
	 */
	$.cookie = function(name, value, options) {
		if (typeof value != 'undefined') { // name and value given, set cookie
			options = options || {};
			if (value === null) {
				value = '';
				options.expires = -1;
			}
			var expires = '';
			if (options.expires && (typeof options.expires == 'number' || options.expires.toUTCString)) {
				var date;
				if (typeof options.expires == 'number') {
					date = new Date();
					date.setTime(date.getTime() + (options.expires * 24 * 60 * 60 * 1000));
				} else {
					date = options.expires;
				}
				expires = '; expires=' + date.toUTCString();
				// use expires attribute, max-age is not supported by IE
			}
			var path = options.path ? '; path=' + options.path : '';
			var domain = options.domain ? '; domain=' + options.domain : '';
			var secure = options.secure ? '; secure' : '';
			document.cookie = [name, '=', encodeURIComponent(value), expires, path, domain, secure].join('');
		} else { // only name given, get cookie
			var cookieValue = null;
			if (document.cookie && document.cookie !== '') {
				var cookies = document.cookie.split(';');
				for (var i = 0, n = cookies.length; i < n; i++) {
					var cookie = $.trim(cookies[i]);
					// Does this cookie string begin with the name we want?
					if (cookie.substring(0, name.length + 1) == (name + '=')) {
						cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
						break;
					}
				}
			}
			return cookieValue;
		}
	};

	/*
	 * 分页加载
	 */
	var _toload = function(option) {
		var def = {
				url: null,
				size: 6,
				data: {},
				reload: false,
				success: null,
				nomore: null,
				error: null
			},
			opt = $.extend({}, def, option),
			sendParam = $.extend(true, {}, opt.data),
			process = _toload.prototype.process,
			trueUrl,
			getPage,
			i = 0,
			n = process.length;
		if (!opt.url) {
			return console.warn('toload()参数缺少url');
		}
		trueUrl = opt.url + '?' + $.param(opt.data);
		for (; i < n; ++i) {
			if (process[i].url == trueUrl) {
				if (opt.reload) {
					getPage = null;
					process.splice(i, 1);
				} else {
					getPage = process[i].getPage;
				}
				break;
			}
		}
		if (!getPage) {
			var newProcess = {};
			getPage = _toload.prototype.newGetPage();
			newProcess.url = trueUrl;
			newProcess.getPage = getPage;
			process.push(newProcess);
			_toload.prototype.process = process;
		}
		trueUrl = null;
		process = null;
		sendParam.page_index = getPage();
		sendParam.page_size = opt.size;
		$.ajax({
			type: 'get',
			url: opt.url,
			data: sendParam,
			dataType: opt.dataType || 'json',
			success: function(res) {
				if ($.isPlainObject(res) && res.status === 'Y' || (res && opt.dataType != 'json')) {
					typeof(opt.success) === 'function' && opt.success(res);
					if ($.isPlainObject(res) && res.data && res.count) {
						var listLength = res.data.split ? JSON.parse(res.data).length : res.data.length;
						if (listLength + sendParam.page_size * (sendParam.page_index - 1) >= parseInt(res.count)) {
							typeof(opt.nomore) === 'function' && opt.nomore();
						}
					}
				} else {
					console.log('数据异常页码回退');
					getPage(true);
					typeof(opt.success) === 'function' && opt.success(res);
				}
			}
		});
	};
	_toload.prototype.newGetPage = function() {
		var loadPage = 0,
			func = function(pullback) {
				if (pullback) {
					return --loadPage;
				}
				return ++loadPage;
			};
		return func;
	};
	_toload.prototype.process = [];

	/*
	 * 函数节流
	 * @method: 函数体; @delay: 过滤执行间隔; @duration: 至少执行一次的间隔
	 */
	var _throttle = function throttle(method, delay, duration) {
		var timer = null,
			begin = new Date();
		delay = delay ? delay : 64;
		duration = duration ? duration : 640;
		return function() {
			var context = this,
				args = arguments,
				current = new Date();
			clearTimeout(timer);
			if (current - begin >= duration) {
				method.apply(context, args);
				begin = current;
			} else {
				timer = setTimeout(function() {
					method.apply(context, args);
				}, delay);
			}
		};
	};
	
	/*
	 * 获取url参数
	 */
	var _getUrlParam = function (name, url) {
		var urlParamReg = new RegExp("(^|&)" + name + "=([^&]*)(&|$)", "i");
		var s = url ? (url.split('?')[1] ? url.split('?')[1] : '') : window.location.search.substr(1);
		var r = s.match(urlParamReg);
		if (r !== null) {
			return decodeURI(r[2]);
		}
		return null;
	};
	/*
	 * 设置url参数
	 */
	var _setUrlParam = function(name, val, url){
		var urlParamReg = new RegExp("(^|&)" + name + "=([^&]*)(&|$)", "i");
		var s = url ? (url.split('?')[1] ? url.split('?')[1] : '') : window.location.search.substr(1);
		var r = s.match(urlParamReg);
		if(r !== null){
			var ori = r[0].replace(/&/g,'');
			var result = url || window.location.href;
			return result.replace(ori, name + '=' + val);
		}
		return null;
	};

	/*
	 * 浏览器
	 */
	var userAgent = navigator.userAgent.toLowerCase(),
		_browser = {};
	_browser.isMobile = !!userAgent.match(/(iphone|ipod|ipad|android|blackberry|bb10|windows phone|tizen|bada)/);
	_browser.ie = /msie\s*(\d+)\./.exec(userAgent) ? /msie\s*(\d+)\./.exec(userAgent)[1] : Infinity;
	_browser.platform = navigator.platform;
	_browser.agent = userAgent;
	_browser.support3d = (function() {
		var el = document.createElement('p'),
			has3d,
			transforms = {
				'webkitTransform': '-webkit-transform',
				'OTransform': '-o-transform',
				'msTransform': '-ms-transform',
				'MozTransform': '-moz-transform',
				'transform': 'transform'
			};
		// Add it to the body to get the computed style.
		document.body.insertBefore(el, null);
		for (var t in transforms) {
			if (el.style[t] !== undefined) {
				el.style[t] = "translate3d(1px,1px,1px)";
				has3d = window.getComputedStyle(el).getPropertyValue(transforms[t]);
			}
		}
		document.body.removeChild(el);
		return (has3d !== undefined && has3d.length > 0 && has3d !== "none");
	})();

	/*
	 * 内部方法
	 */
	// 兼容css3位移
	!$.fn._css && ($.fn._css = function(LeftOrTop, number) {
		var hasTrans = (LeftOrTop == 'left' || LeftOrTop == 'top') ? true : false,
			canTrans = _browser.support3d,
			theTrans = LeftOrTop == 'left' ? 'translateX' : 'translateY',
			matrixPosi = hasTrans ? (LeftOrTop == 'left' ? 4 : 5) : null;
		if (number != void(0)) {
			//赋值
			if (canTrans && hasTrans) {
				number = parseFloat(number) + 'px';
				$(this).css('transform', 'translateZ(0) ' + theTrans + '(' + number + ')');
			} else {
				$(this).css(LeftOrTop, number);
			}
			return $(this);
		} else {
			//取值
			if (canTrans && hasTrans && $(this).css('transform') !== 'none') {
				var transData = $(this).css('transform').match(/\((.*\,?\s?){6}\)$/)[0].substr(1).split(',');
				return parseFloat(transData[matrixPosi]);
			} else {
				return $(this).css(LeftOrTop);
			}
		}
	});
	// 加载指定属性的图片
	!$.fn._loadimg && ($.fn._loadimg = function(imgattr) {
		var $this = $(this),
			lazyImg;
		if (!imgattr) {
			return $this;
		}
		if ($this.attr(imgattr)) {
			lazyImg = $this;
		} else if ($(this).find('img[' + imgattr + ']').length) {
			lazyImg = $(this).find('img[' + imgattr + ']');
		} else {
			return $this;
		}
		if (lazyImg.length) {
			var _theSrc;
			lazyImg.each(function(i, e) {
				_theSrc = $.trim($(e).attr(imgattr));
				if (_theSrc && _theSrc != 'loaded') {
					if (e.tagName.toLowerCase() === 'img') {
						$(e).attr('src', _theSrc).attr(imgattr, 'loaded').addClass('loaded');
					} else {
						$(e).css("background-image", "url(" + _theSrc + ")").attr(imgattr, 'loaded').addClass('loaded');
					}
				}
			});
			_theSrc = null;
		}
		return $(this);
	});
	//getScript
	var _getScript = function(road, callback, option) {
		if (road && road.split || ($.isArray(road) && road.length)) {
			var def = {
					css: false,
					jquery: false,
					rely: false
				},
				opt = $.extend({}, def, $.isPlainObject(callback) ? callback : option || {}),
				cssLoaded = false,
				loadScript = function(road, hold) {
					/*
					@road:请求url
					@hold:是否阻断默认回调，为function将阻断默认回调并执行自身
					*/
					var file = seajs.resolve(road),
						headNode = document.getElementsByTagName('head')[0],
						script = document.createElement("script"),
						scriptError = function(xhr, settings, exception) {
							headNode.removeChild(script);
							script = document.createElement("script");
							console.warn(settings.url + '加载失败，正在重试~');
							load(function() {
								console.warn(settings.url + '加载失败了!');
							});
						},
						scriptOnload = function(data, status) {
							if (!data) {
								data = status = null;
							}
							if (hold) {
								if(typeof(hold) === 'function'){
									hold();
								}
							} else if (typeof(callback) === 'function') {
								setTimeout(callback, 0);
							}
						},
						load = function(errorCallback) {
							errorCallback = errorCallback || scriptError;
							if (opt.jquery) {
								window.$ = $;
								window.jQuery = $;
							}
							script.type = "text/javascript";
							if (script.addEventListener) {
								script.addEventListener("load", scriptOnload, false);
							} else if (script.readyState) {
								script.onreadystatechange = function() {
									if (script.readyState == "loaded" || script.readyState == "complete") {
										script.onreadystatechange = null;
										scriptOnload();
									}
								};
							} else {
								script.onload = scriptOnload;
							}
							script.onerror = errorCallback;
							script.src = file;
							headNode.appendChild(script);
						};
					if (opt.css && !cssLoaded) {
						var cssfile = '',
							appendCss = function(href) {
								href = seajs.resolve(href).replace(/\.css\.js$/, ".css").replace(/\.js$/, ".css");
								var _css = document.createElement('link');
								_css.rel = "stylesheet";
								_css.onerror = function(e) {
									headNode.removeChild(_css);
									_css = null;
									return null;
								};
								_css.href = href;
								headNode.appendChild(_css);
							};
						if (opt.css.split) {
							cssfile = opt.css;
							appendCss(cssfile);
							cssLoaded = true;
						} else if ($.isArray(opt.css)) {
							$.each(opt.css, function(i, href) {
								appendCss(href);
							});
							cssLoaded = true;
						} else {
							appendCss(file);
						}
					}
					load();
				};
			if (road.split) {
				loadScript(road);
			} else if ($.isArray(road)) {
				var scriptsLength = road.length,
					scriptsCount = 0;
				if (opt.rely) {
					//线性依赖
					var getNext = function(isLast) {
						var hold;
						if (!isLast) {
							hold = function() {
								scriptsCount++;
								getNext(scriptsCount >= (scriptsLength - 1));
							};
						}
						loadScript(road[scriptsCount], hold);
					};
					getNext();
				} else {
					//同时发起
					var scriptRoad;
					while (scriptsCount < scriptsLength) {
						scriptRoad = road[scriptsCount];
						scriptsCount++;
						loadScript(scriptRoad, scriptsLength > scriptsCount);
					}
				}
			}
		}else{
			return console.warn('getScript()参数错误！');
		}
	};
	//ajaxCombo
	var _ajaxCombo = function(option) {
		var def = {
				comboUrl: "/test/combo.php",
				extendData: {},
				comboDataKey: "paramArray",
				duration: 16,
				everytimeout: 2000
			},
			ajaxComboObject,
			ajaxComboIndex,
			ajaxComboTimer;
		_ajaxCombo.prototype.option = $.extend(def, option || {});
		if (_ajaxCombo.prototype.runed) {
			return null;
		}
		_ajaxCombo.prototype.runed = true;
		$(document).bind("ajaxSend", function(event, request, settings) {
			var opt = _ajaxCombo.prototype.option,
				newAjax;
			if (!settings.combo) {
				return null;
			}
			request.abort();
			newAjax = {
				async: settings.async,
				contentType: settings.contentType,
				crossDomain: settings.crossDomain,
				data: settings.data,
				dataType: settings.dataType,
				type: settings.type,
				url: settings.url,
				success: settings.success
			};
			//归零
			if (ajaxComboTimer) {
				clearTimeout(ajaxComboTimer);
			} else {
				ajaxComboIndex = 0;
				ajaxComboObject = {};
			}
			(function() {
				//get请求特殊处理
				if (settings.type === 'GET') {
					newAjax.data = newAjax.url.split('?')[1];
					newAjax.url = newAjax.url.split('?')[0];
				}
				//data转obj
				var dataArray = newAjax.data.split('&'),
					dataObj = {};
				$.each(dataArray, function(i, e) {
					var _key = dataArray[i].split('=')[0],
						_val = dataArray[i].split('=')[1];
					dataObj[_key] = _val;
				});
				//并入ajaxComboObject
				newAjax.data = dataObj;
				ajaxComboObject['combo' + (++ajaxComboIndex)] = newAjax;
			})();
			//合并发送
			ajaxComboTimer = setTimeout(function() {
				//剔除回调函数
				var ajaxComboData = $.extend(true, {}, opt.extendData),
					localCatch = $.extend(true, {}, ajaxComboObject);
				ajaxComboData[opt.comboDataKey] = $.extend(true, {}, localCatch);
				$.each(localCatch, function(key, val) {
					if (localCatch[key].success) {
						delete ajaxComboData[opt.comboDataKey][key].success;
					}
				});
				ajaxComboTimer = null;
				$.ajax({
					type: 'post',
					global: false,
					timeout: ajaxComboIndex * opt.everytimeout,
					url: opt.comboUrl,
					data: ajaxComboData,
					dataType: 'json',
					success: function(data) {
						if (data && typeof(data) === 'object') {
							//分发回调
							$.each(localCatch, function(key, val) {
								if (localCatch[key].success) {
									if (data[key] && data[key].data) {
										localCatch[key].success(data[key].data);
									} else {
										console.log("ajaxCombo:" + localCatch[key].url + "数据有误");
									}
								}
							});
							localCatch = null;
						} else {
							console.log('ajaxCombo:数据错误');
						}
					},
					error: function(xhr) {
						//分发原请求
						$.each(localCatch, function(key, val) {
							$.ajax(localCatch[key]);
						});
						localCatch = null;
					}
				});
			}, opt.duration);
			return null;
		});
	};
	var _getStyle = function(elem, attr) {
		if (elem.currentStyle) {
			return elem.currentStyle[attr];
		} else if (document.defaultView && document.defaultView.getComputedStyle) {
			attr = attr.replace(/([A-Z])/g, '-$1').toLowerCase();
			return document.defaultView.getComputedStyle(elem, null).getPropertyValue(attr);
		} else {
			return null;
		}
	};
	/*
	 * 输出
	 */
	module.exports = {
		getUID: getUID,
		getUUID: getUUID,
		browser: _browser,
		getStyle: _getStyle,
		toload: _toload,
		throttle: _throttle,
		url: {
			get: _getUrlParam,
			set: _setUrlParam
		},
		getScript: _getScript,
		ajaxCombo: _ajaxCombo,
		ajaxSetup: _ajaxSetup
	};
});