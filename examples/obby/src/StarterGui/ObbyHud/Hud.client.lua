local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local gui = script.Parent

local frame = Instance.new("Frame")
frame.Name = "Panel"
frame.Size = UDim2.new(0, 260, 0, 84)
frame.Position = UDim2.new(0.5, -130, 0, 12)
frame.BackgroundColor3 = Color3.fromRGB(25, 28, 36)
frame.BackgroundTransparency = 0.15
frame.Parent = gui
Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 12)

local title = Instance.new("TextLabel")
title.Name = "Stage"
title.BackgroundTransparency = 1
title.Size = UDim2.new(1, 0, 0, 36)
title.Font = Enum.Font.GothamBold
title.TextSize = 24
title.TextColor3 = Color3.new(1, 1, 1)
title.Text = "Stage 0 / ?"
title.Parent = frame

local barBg = Instance.new("Frame")
barBg.Name = "BarBg"
barBg.Position = UDim2.new(0, 14, 0, 46)
barBg.Size = UDim2.new(1, -28, 0, 14)
barBg.BackgroundColor3 = Color3.fromRGB(60, 64, 76)
barBg.Parent = frame
Instance.new("UICorner", barBg).CornerRadius = UDim.new(1, 0)
local bar = Instance.new("Frame")
bar.Name = "Bar"
bar.Size = UDim2.new(0, 0, 1, 0)
bar.BackgroundColor3 = Color3.fromRGB(80, 220, 120)
bar.Parent = barBg
Instance.new("UICorner", bar).CornerRadius = UDim.new(1, 0)

local deaths = Instance.new("TextLabel")
deaths.Name = "Deaths"
deaths.BackgroundTransparency = 1
deaths.Position = UDim2.new(0, 0, 0, 62)
deaths.Size = UDim2.new(1, 0, 0, 18)
deaths.TextSize = 14
deaths.TextColor3 = Color3.fromRGB(200, 200, 210)
deaths.Text = "Deaths: 0"
deaths.Parent = frame

local banner = Instance.new("TextLabel")
banner.Name = "Banner"
banner.Visible = false
banner.AnchorPoint = Vector2.new(0.5, 0.5)
banner.Position = UDim2.new(0.5, 0, 0.4, 0)
banner.Size = UDim2.new(0, 420, 0, 80)
banner.BackgroundColor3 = Color3.fromRGB(255, 200, 40)
banner.TextColor3 = Color3.fromRGB(40, 30, 0)
banner.TextSize = 32
banner.Font = Enum.Font.GothamBlack
banner.Parent = gui
Instance.new("UICorner", banner)

local player = Players.LocalPlayer
local event = ReplicatedStorage:WaitForChild("StageEvent")
local started = os.clock()

event.OnClientEvent:Connect(function(kind, a, b)
	if kind == "stage" then
		title.Text = ("Stage %d / %d"):format(a, b)
		TweenService:Create(bar, TweenInfo.new(0.4), { Size = UDim2.new(a / b, 0, 1, 0) }):Play()
	elseif kind == "win" then
		banner.Text = ("%s finished in %.0fs!"):format(a, os.clock() - started)
		banner.Visible = true
		task.delay(4, function()
			banner.Visible = false
		end)
	end
end)

local ls = player:WaitForChild("leaderstats")
local d = ls:WaitForChild("Deaths")
d.Changed:Connect(function(v)
	deaths.Text = "Deaths: " .. v
end)
