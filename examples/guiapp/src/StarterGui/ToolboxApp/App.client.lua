local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local Calc = require(ReplicatedStorage.Calc)
local gui = script.Parent

local THEME = { bg = Color3.fromRGB(30, 33, 44), card = Color3.fromRGB(44, 48, 64), accent = Color3.fromRGB(90, 140, 255), text = Color3.fromRGB(235, 238, 250) }

local root = Instance.new("Frame")
root.Name = "Window"
root.AnchorPoint = Vector2.new(0.5, 0.5)
root.Position = UDim2.fromScale(0.5, 0.5)
root.Size = UDim2.new(0, 520, 0, 420)
root.BackgroundColor3 = THEME.bg
root.Parent = gui
Instance.new("UICorner", root).CornerRadius = UDim.new(0, 14)
local stroke = Instance.new("UIStroke", root)
stroke.Color = THEME.accent
stroke.Thickness = 2

local tabs = Instance.new("Frame")
tabs.Name = "Tabs"
tabs.Size = UDim2.new(1, 0, 0, 44)
tabs.BackgroundTransparency = 1
tabs.Parent = root
local tl = Instance.new("UIListLayout")
tl.FillDirection = Enum.FillDirection.Horizontal
tl.Padding = UDim.new(0, 6)
tl.Parent = tabs
Instance.new("UIPadding", tabs).PaddingLeft = UDim.new(0, 10)

local pages = {}
local tabButtons = {}
local function showPage(name)
	for n, p in pairs(pages) do
		p.Visible = (n == name)
	end
	for n, b in pairs(tabButtons) do
		TweenService:Create(b, TweenInfo.new(0.15), { BackgroundColor3 = n == name and THEME.accent or THEME.card }):Play()
	end
end
local function addTab(name)
	local b = Instance.new("TextButton")
	b.Name = "Tab_" .. name
	b.Size = UDim2.new(0, 110, 0, 34)
	b.Text = name
	b.TextColor3 = THEME.text
	b.BackgroundColor3 = THEME.card
	b.Font = Enum.Font.GothamMedium
	b.TextSize = 16
	b.Parent = tabs
	Instance.new("UICorner", b)
	local p = Instance.new("Frame")
	p.Name = "Page_" .. name
	p.Position = UDim2.new(0, 10, 0, 50)
	p.Size = UDim2.new(1, -20, 1, -60)
	p.BackgroundTransparency = 1
	p.Visible = false
	p.Parent = root
	pages[name] = p
	tabButtons[name] = b
	b.MouseButton1Click:Connect(function()
		showPage(name)
	end)
	return p
end

------------------------------------------------ Todo tab
do
	local page = addTab("Todo")
	local input = Instance.new("TextBox")
	input.Name = "Input"
	input.Size = UDim2.new(1, -90, 0, 36)
	input.BackgroundColor3 = THEME.card
	input.TextColor3 = THEME.text
	input.PlaceholderText = "New task…"
	input.Text = ""
	input.ClearTextOnFocus = false
	input.TextXAlignment = Enum.TextXAlignment.Left
	input.Parent = page
	Instance.new("UICorner", input)
	local add = Instance.new("TextButton")
	add.Name = "Add"
	add.Position = UDim2.new(1, -80, 0, 0)
	add.Size = UDim2.new(0, 80, 0, 36)
	add.Text = "Add"
	add.BackgroundColor3 = THEME.accent
	add.TextColor3 = Color3.new(1, 1, 1)
	add.Parent = page
	Instance.new("UICorner", add)
	local scroll = Instance.new("ScrollingFrame")
	scroll.Name = "List"
	scroll.Position = UDim2.new(0, 0, 0, 46)
	scroll.Size = UDim2.new(1, 0, 1, -76)
	scroll.BackgroundTransparency = 1
	scroll.ScrollBarThickness = 6
	scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
	scroll.CanvasSize = UDim2.new()
	scroll.Parent = page
	local ll = Instance.new("UIListLayout")
	ll.Padding = UDim.new(0, 6)
	ll.SortOrder = Enum.SortOrder.LayoutOrder
	ll.Parent = scroll
	local count = Instance.new("TextLabel")
	count.Name = "Count"
	count.Position = UDim2.new(0, 0, 1, -26)
	count.Size = UDim2.new(1, 0, 0, 24)
	count.BackgroundTransparency = 1
	count.TextColor3 = THEME.text
	count.TextXAlignment = Enum.TextXAlignment.Left
	count.Parent = page

	local tasks = {}
	local n = 0
	local function recount()
		local done = 0
		for _, t in ipairs(tasks) do
			if t.done then
				done += 1
			end
		end
		count.Text = ("%d tasks, %d done"):format(#tasks, done)
	end
	local function addTask(text)
		n += 1
		local t = { text = text, done = false }
		table.insert(tasks, t)
		local row = Instance.new("Frame")
		row.Name = "Row" .. n
		row.LayoutOrder = n
		row.Size = UDim2.new(1, -10, 0, 34)
		row.BackgroundColor3 = THEME.card
		row.Parent = scroll
		Instance.new("UICorner", row)
		local lbl = Instance.new("TextButton")
		lbl.Name = "Label"
		lbl.Size = UDim2.new(1, -44, 1, 0)
		lbl.BackgroundTransparency = 1
		lbl.TextXAlignment = Enum.TextXAlignment.Left
		lbl.TextColor3 = THEME.text
		lbl.Text = "  " .. text
		lbl.Parent = row
		lbl.MouseButton1Click:Connect(function()
			t.done = not t.done
			lbl.Text = (t.done and "  ✔ " or "  ") .. text
			lbl.TextColor3 = t.done and Color3.fromRGB(120, 200, 140) or THEME.text
			recount()
		end)
		local del = Instance.new("TextButton")
		del.Name = "Del"
		del.Position = UDim2.new(1, -40, 0, 2)
		del.Size = UDim2.new(0, 36, 1, -4)
		del.Text = "✕"
		del.BackgroundColor3 = Color3.fromRGB(150, 60, 60)
		del.TextColor3 = Color3.new(1, 1, 1)
		del.Parent = row
		Instance.new("UICorner", del)
		del.MouseButton1Click:Connect(function()
			table.remove(tasks, table.find(tasks, t))
			row:Destroy()
			recount()
		end)
		recount()
	end
	local function submit()
		local s = input.Text:match("^%s*(.-)%s*$")
		if #s > 0 then
			addTask(s)
			input.Text = ""
		end
	end
	add.MouseButton1Click:Connect(submit)
	input.FocusLost:Connect(function(enter)
		if enter then
			submit()
		end
	end)
	addTask("Read the Luau docs")
	addTask("Convert my game to the web")
	recount()
end

------------------------------------------------ Calculator tab
do
	local page = addTab("Calc")
	local display = Instance.new("TextLabel")
	display.Name = "Display"
	display.Size = UDim2.new(1, 0, 0, 56)
	display.BackgroundColor3 = Color3.new(0, 0, 0)
	display.TextColor3 = Color3.fromRGB(120, 255, 160)
	display.TextXAlignment = Enum.TextXAlignment.Right
	display.TextSize = 30
	display.Text = "0"
	display.Parent = page
	Instance.new("UICorner", display)
	Instance.new("UIPadding", display).PaddingRight = UDim.new(0, 10)
	local grid = Instance.new("Frame")
	grid.Name = "Keys"
	grid.Position = UDim2.new(0, 0, 0, 66)
	grid.Size = UDim2.new(1, 0, 1, -66)
	grid.BackgroundTransparency = 1
	grid.Parent = page
	local ug = Instance.new("UIGridLayout")
	ug.CellSize = UDim2.new(0.25, -6, 0, 40)
	ug.CellPadding = UDim2.new(0, 6, 0, 6)
	ug.SortOrder = Enum.SortOrder.LayoutOrder
	ug.Parent = grid
	local expr = ""
	local keys = { "7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "C", "+", "(", ")", "^", "=" }
	for i, k in ipairs(keys) do
		local b = Instance.new("TextButton")
		b.Name = "Key" .. i
		b.LayoutOrder = i
		b.Text = k
		b.TextSize = 22
		b.TextColor3 = THEME.text
		b.BackgroundColor3 = (k == "=") and THEME.accent or THEME.card
		b.Parent = grid
		Instance.new("UICorner", b)
		b.Activated:Connect(function()
			if k == "C" then
				expr = ""
				display.Text = "0"
			elseif k == "=" then
				local ok, res = pcall(Calc.eval, expr)
				if ok then
					display.Text = tostring(res)
					expr = tostring(res)
				else
					display.Text = "Error"
					expr = ""
				end
			else
				expr ..= k
				display.Text = expr
			end
		end)
	end
end

------------------------------------------------ Timer tab (coroutines + task.wait)
do
	local page = addTab("Timer")
	local lbl = Instance.new("TextLabel")
	lbl.Name = "Clock"
	lbl.Size = UDim2.new(1, 0, 0, 90)
	lbl.BackgroundTransparency = 1
	lbl.TextColor3 = THEME.text
	lbl.TextSize = 64
	lbl.Text = "00:10"
	lbl.Parent = page
	local start = Instance.new("TextButton")
	start.Name = "Start"
	start.Position = UDim2.new(0.5, -70, 0, 110)
	start.Size = UDim2.new(0, 140, 0, 44)
	start.Text = "Start"
	start.BackgroundColor3 = THEME.accent
	start.TextColor3 = Color3.new(1, 1, 1)
	start.Parent = page
	Instance.new("UICorner", start)
	local bar = Instance.new("Frame")
	bar.Name = "Progress"
	bar.Position = UDim2.new(0, 0, 0, 180)
	bar.Size = UDim2.new(0, 0, 0, 10)
	bar.BackgroundColor3 = Color3.fromRGB(120, 220, 140)
	bar.Parent = page
	local running = false
	start.MouseButton1Click:Connect(function()
		if running then
			return
		end
		running = true
		task.spawn(function()
			local total = 10
			for s = total, 0, -1 do
				lbl.Text = string.format("%02d:%02d", s // 60, s % 60)
				TweenService:Create(bar, TweenInfo.new(0.9), { Size = UDim2.new((total - s) / total, 0, 0, 10) }):Play()
				if s > 0 then
					task.wait(1)
				end
			end
			lbl.Text = "Done!"
			running = false
		end)
	end)
end

showPage("Todo")
