local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Data = require(ReplicatedStorage.TycoonData)
local remote = ReplicatedStorage:WaitForChild("TycoonRemote")
local buy = ReplicatedStorage:WaitForChild("BuyItem")
local gui = script.Parent
local player = Players.LocalPlayer

local cashLabel = Instance.new("TextLabel")
cashLabel.Name = "Cash"
cashLabel.Size = UDim2.new(0, 220, 0, 44)
cashLabel.Position = UDim2.new(0, 12, 0, 12)
cashLabel.BackgroundColor3 = Color3.fromRGB(20, 24, 30)
cashLabel.TextColor3 = Color3.fromRGB(255, 215, 80)
cashLabel.Font = Enum.Font.GothamBold
cashLabel.TextSize = 26
cashLabel.Text = "$0"
cashLabel.Parent = gui
Instance.new("UICorner", cashLabel)

local msg = Instance.new("TextLabel")
msg.Name = "Msg"
msg.BackgroundTransparency = 1
msg.Position = UDim2.new(0, 12, 0, 60)
msg.Size = UDim2.new(0, 360, 0, 24)
msg.TextXAlignment = Enum.TextXAlignment.Left
msg.TextColor3 = Color3.new(1, 1, 1)
msg.TextSize = 16
msg.Text = ""
msg.Parent = gui

local list = Instance.new("Frame")
list.Name = "Shop"
list.Position = UDim2.new(1, -250, 0, 12)
list.Size = UDim2.new(0, 238, 0, 330)
list.BackgroundColor3 = Color3.fromRGB(20, 24, 30)
list.BackgroundTransparency = 0.1
list.Parent = gui
Instance.new("UICorner", list)
local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 6)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = list
Instance.new("UIPadding", list).PaddingTop = UDim.new(0, 8)

local owned = {}
local rows = {}
local function refresh()
	for _, it in ipairs(Data.Items) do
		local b = rows[it.Id]
		if owned[it.Id] then
			b.Text = it.Name .. "  ✔"
			b.BackgroundColor3 = Color3.fromRGB(70, 70, 76)
		elseif it.Requires and not owned[it.Requires] then
			b.Text = it.Name .. "  🔒"
			b.BackgroundColor3 = Color3.fromRGB(110, 70, 70)
		else
			b.Text = ("%s  $%d"):format(it.Name, it.Cost)
			b.BackgroundColor3 = Color3.fromRGB(50, 150, 80)
		end
	end
end
for i, it in ipairs(Data.Items) do
	local b = Instance.new("TextButton")
	b.Name = "Item_" .. it.Id
	b.LayoutOrder = i
	b.Size = UDim2.new(1, -16, 0, 34)
	b.TextColor3 = Color3.new(1, 1, 1)
	b.TextSize = 15
	b.Font = Enum.Font.GothamMedium
	b.Parent = list
	Instance.new("UICorner", b)
	rows[it.Id] = b
	b.Activated:Connect(function()
		local ok, why = buy:InvokeServer(it.Id)
		if not ok then
			msg.Text = ({ funds = "Not enough cash", locked = "Buy previous items first", owned = "Already owned", bad = "Invalid" })[why] or "Cannot buy"
		else
			msg.Text = "Bought " .. it.Name .. "!"
		end
	end)
end

local passBtn = Instance.new("TextButton")
passBtn.Name = "PassBtn"
passBtn.LayoutOrder = 100
passBtn.Size = UDim2.new(1, -16, 0, 34)
passBtn.BackgroundColor3 = Color3.fromRGB(190, 120, 20)
passBtn.TextColor3 = Color3.new(1, 1, 1)
passBtn.Text = "2x Cash (Game Pass)"
passBtn.Parent = list
Instance.new("UICorner", passBtn)
passBtn.Activated:Connect(function()
	remote:FireServer("buypass")
end)
local packBtn = passBtn:Clone()
packBtn.Name = "PackBtn"
packBtn.LayoutOrder = 101
packBtn.Text = "+2000 Cash (Product)"
packBtn.Parent = list
packBtn.Activated:Connect(function()
	remote:FireServer("buycash")
end)

remote.OnClientEvent:Connect(function(kind, a, b)
	if kind == "init" then
		owned = a
		if b then
			passBtn.Text = "2x Cash ✔"
		end
		refresh()
	elseif kind == "bought" then
		owned[a] = true
		refresh()
	elseif kind == "denied" then
		msg.Text = "Denied: " .. tostring(a)
	elseif kind == "pass" then
		passBtn.Text = "2x Cash ✔"
	end
end)

local ls = player:WaitForChild("leaderstats")
local cash = ls:WaitForChild("Cash")
local function upd()
	cashLabel.Text = "$" .. tostring(cash.Value)
end
cash:GetPropertyChangedSignal("Value"):Connect(upd)
upd()
refresh()
