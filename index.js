var internals = {};
var fs = require("fs");
var moment = require("moment");
var Papa = require("papaparse");
var lodash = require("lodash");

String.prototype.splice = function(idx, rem, str) {
    return this.slice(0, idx) + str + this.slice(idx + Math.abs(rem));
};

var parsers = {
	parser: {}
};

parsers.add = function(type, parserFunction) {
	parsers.parser[type] = {};
	parsers.parser[type].parse = parserFunction;
}

parsers.list = function() {
	return Object.keys(parsers.parser);
}
parsers.parse = function(data, options) {
	if (this.parser[options.type] &&
		typeof this.parser[options.type].parse === 'function') {

		return this.parser[options.type].parse(data, options)
	} else {
		if (this.parser.default &&
			typeof this.parser.default.parse === 'function') {

			return this.parser.default.parse(data, options)
		} else {
			return data;
		}
	}
}

parsers.add("bool", function(data, options) {
	return (data === options.tVal) ? true : false;
});

parsers.add("date", function(data, options) {
	var output = null;

	if (options && options.inputformat && options.outputformat) {
		if (moment(data, options.inputformat).isValid()) {
			output = moment(data, options.inputformat)
						.format(options.outputformat);	
		}
	} else if (moment(data).isValid()) {
		output = moment(data).format(options.outputformat);
	}

	return output;
});

parsers.add("float", function(data, options) {
	var defaultPrecision = 2;

	var output = null;

	if (options.percision) {
		options.precision = options.percision;

		delete options.percision;
	}

	var precision = (parseInt(options.precision) >= 0) ?
						options.precision :
						defaultPrecision;

	var symbol = (options.symbol && options.format === "csv") ?
					options.symbol : "";

	if (lodash.includes(data, '.')) {
		output = symbol + parseFloat(data).toFixed(precision);
	} else {
		output = symbol + parseFloat(data
										.splice(options.width -
											precision, 0, '.'))
										.toFixed(precision);
	}

	return output;
});

parsers.add("int", function(data, options) {
	return parseInt(data);
});

parsers.add("string", function(data, options) {
	return data;
});

parsers.add("default", parsers.parser.string.parse)

var parseCol = function(row, map, format){
	var r = {};
	lodash.forEach(map, function(i){
		if (format) { i.format = format; }
		var v = row.substring(i.start-1, (i.start + i.width - 1)).trim();
		if(v){
			r[i.name] = parsers.parse(v, i);
		}
	});
	return r;
};

internals.parsers = parsers.parser;

internals.addParser = function(type, parserFunction) {
	parsers.add(type, parserFunction);
}

internals.getParsers = function() {
	return parsers.list();
}

internals.parse = function(specs, input){
	try {
		if(typeof(specs) !== "object")  throw "specs is not an array";
		if(lodash.isEmpty(specs)) throw "specs is empty";
		if(lodash.isEmpty(specs.map)) throw "specs maps is empty";
		if(lodash.isEmpty(specs.options)) throw "specs options is empty";
		if(input === "") throw "input is empty";
		var array_output = [];
		var object_output = {};
		var split_input = input.replace(/\r\n/g,'\n').split("\n");
		if(split_input.indexOf("") !== -1){
			split_input.splice(split_input.indexOf(""), 1);
		}
		lodash.forEach(split_input, function(i, idx){
			if(i.length === specs.options.fullwidth && !specs.options.levels){
				if(specs.options.skiplines !== null){
					if(specs.options.skiplines.indexOf(parseInt(idx) + 1) === -1){
						array_output.push(parseCol(i, specs.map, specs.options.format));
					}
				}
				else{
					array_output.push(parseCol(i, specs.map, specs.options.format));
				}
			}
			else if(specs.options.levels){
				var level = lodash.find(specs.options.levels, function(v, k){
					if(idx >= v.start && idx <= v.end){
						return true;
					}
				});
				var level_map = lodash.filter(specs.map, {
					level: lodash.findKey(specs.options.levels, function(v, k){
						if(idx >= v.start && idx <= v.end){
							return true;
						}
					})
				});
				if(i.length === level.fullwidth){
					if(!object_output.hasOwnProperty(level.nickname)){
						object_output[level.nickname] = [];
					}
					if(specs.options.skiplines !== null){
						if(specs.options.skiplines.indexOf(parseInt(idx) + 1) === -1){
							object_output[level.nickname].push(parseCol(i, level_map, specs.options.format));
						}
					}
					else{
						object_output[level.nickname].push(parseCol(i, level_map, specs.options.format));
					}
				}
				else{
					throw "Row #" + (parseInt(idx) + 1) + " does not match fullwidth";
				}
			}
			else{
				throw "Row #" + (parseInt(idx) + 1) + " does not match fullwidth";
			}
		});
		switch(specs.options.format){
			case "csv":
				if(array_output.length === 0){
					throw "Multi-Level Maps Cannot Convert to CSV";
				}
				else{
					return Papa.unparse(array_output.length > 0 ? array_output : object_output, {
						newline: "\n"
					});	
				}
				break;
			default:
				return array_output.length > 0 ? array_output : object_output;
		}	
	}
	catch(err){
		console.log(err);
	}
};

internals.unparse = function(specs, input, levels){
	var output = [];
	try {
		if(typeof(specs) !== "object")  throw "specs is not an array";
		if(lodash.isEmpty(specs)) throw "specs is empty";
		if(input === "") throw "input is empty";
		var counter = 0;
		if(levels){
			var rowCount = 0;
			lodash.forEach(levels, function(l){
				var input_by_level = input[l];
				rowCount = rowCount + input_by_level.length;
			});
			lodash.forEach(levels, function(l){
				var input_by_level = input[l];
				var specs_by_level = lodash.filter(specs, {
					level: l
				});
				lodash.forEach(input_by_level, function(inp){
					lodash.forEach(specs_by_level, function(spec){
						var value = String(inp[spec.name]);
						var valueLength = value.length;
						if(spec.width - value.length > 0){
							for(var i = 1; i <= spec.width - valueLength; i++){
								var symbol = spec.padding_symbol ? spec.padding_symbol : " ";
								if(symbol.length > 1) throw "padding_symbol can not have length > 1";
								switch(spec.padding_position){
									case "start":
										value = symbol + value;
										break;
									case "end":
										value = value + symbol;
										break;
									default:
										value = symbol + value;
										break;
								}
							}
							output = output + value;
						}
					});
					counter = counter + 1;
					if(rowCount !== counter){
						output = output + "\n"
					}
				});

			});
			return output;
		}
		else{
			for(var row in input){
				for(var spec in specs){
					var value = String(input[row][specs[spec].name]);
					var valueLength = value.length;
					if(specs[spec].width - value.length > 0){
						for(var i = 1; i <= specs[spec].width - valueLength; i++){
							var symbol = specs[spec].padding_symbol ? specs[spec].padding_symbol : " ";
							if(symbol.length > 1) throw "padding_symbol can not have length > 1";
							switch(specs[spec].padding_position){
								case "start":
									value = symbol + value;
									break;
								case "end":
									value = value + symbol;
									break;
								default:
									value = symbol + value;
									break;
							}
						}
					}
					output = output + value;
				}
				counter = counter + 1;
				if(input.length !== counter){
					output = output + "\n"
				}
			}
			return output;
		}
	}
	catch(err){
		console.log(err);
	}
};

module.exports = internals;