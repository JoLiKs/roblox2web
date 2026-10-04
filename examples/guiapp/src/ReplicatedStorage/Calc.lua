-- tiny expression calculator (recursive descent) used by the GUI app
local Calc = {}

local function tokenize(s)
	local toks = {}
	local i = 1
	while i <= #s do
		local c = s:sub(i, i)
		if c:match("%s") then
			i += 1
		elseif c:match("[%d%.]") then
			local num = s:match("^%d*%.?%d+", i) or s:match("^%d+", i)
			if not num then
				error("bad number at " .. i)
			end
			table.insert(toks, { t = "num", v = tonumber(num) })
			i += #num
		elseif c:match("[%+%-%*/%^%(%)%%]") then
			table.insert(toks, { t = c })
			i += 1
		else
			error(("unexpected '%s'"):format(c))
		end
	end
	return toks
end

function Calc.eval(src)
	local toks = tokenize(src)
	local pos = 1
	local expr
	local function peek()
		return toks[pos] and toks[pos].t
	end
	local function atom()
		local t = toks[pos]
		if not t then
			error("unexpected end")
		end
		pos += 1
		if t.t == "num" then
			return t.v
		elseif t.t == "-" then
			return -atom()
		elseif t.t == "(" then
			local v = expr()
			if peek() ~= ")" then
				error("expected )")
			end
			pos += 1
			return v
		end
		error("unexpected " .. t.t)
	end
	local function power()
		local b = atom()
		if peek() == "^" then
			pos += 1
			return b ^ power()
		end
		return b
	end
	local function term()
		local v = power()
		while peek() == "*" or peek() == "/" or peek() == "%" do
			local op = toks[pos].t
			pos += 1
			local r = power()
			if op == "*" then
				v *= r
			elseif op == "/" then
				v /= r
			else
				v %= r
			end
		end
		return v
	end
	function expr()
		local v = term()
		while peek() == "+" or peek() == "-" do
			local op = toks[pos].t
			pos += 1
			local r = term()
			v = if op == "+" then v + r else v - r
		end
		return v
	end
	local v = expr()
	if pos <= #toks then
		error("trailing input")
	end
	return v
end

return Calc
