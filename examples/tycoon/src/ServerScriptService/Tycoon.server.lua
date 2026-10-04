local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local MarketplaceService = game:GetService("MarketplaceService")
local DataStoreService = game:GetService("DataStoreService")
local Debris = game:GetService("Debris")
local Data = require(ReplicatedStorage.TycoonData)
local store = DataStoreService:GetDataStore("TycoonSave")

local Remote = Instance.new("RemoteEvent")
Remote.Name = "TycoonRemote"
Remote.Parent = ReplicatedStorage
local Buy = Instance.new("RemoteFunction")
Buy.Name = "BuyItem"
Buy.Parent = ReplicatedStorage

local function mk(class, props, parent)
	local i = Instance.new(class)
	for k, v in pairs(props) do
		i[k] = v
	end
	i.Parent = parent
	return i
end

local base = mk("Part", { Name = "Baseplate", Size = Vector3.new(120, 2, 120), Position = Vector3.new(0, -1, 0), Anchored = true, Color = Color3.fromRGB(90, 140, 80), Material = Enum.Material.Grass }, workspace)
mk("SpawnLocation", { Size = Vector3.new(8, 1, 8), Position = Vector3.new(-30, 0.6, 30), Anchored = true, Neutral = true }, workspace)

-- per-player tycoon state
local states = {}
local plot = Instance.new("Folder")
plot.Name = "Plot"
plot.Parent = workspace

local conveyor = mk("Part", { Name = "Conveyor", Size = Vector3.new(6, 1, 40), Position = Vector3.new(0, 0.5, 0), Anchored = true, Color = Color3.fromRGB(60, 60, 66), Material = Enum.Material.Metal }, plot)
conveyor.AssemblyLinearVelocity = Vector3.new(0, 0, 14)
local collector = mk("Part", { Name = "Collector", Size = Vector3.new(8, 4, 2), Position = Vector3.new(0, 2.5, 22), Anchored = true, CanCollide = false, Transparency = 0.5, Color = Color3.fromRGB(255, 220, 0) }, plot)

local function ownerState()
	return states[next(states)]
end

local function addCash(st, n)
	local mult = st.mult
	if st.gamepass then
		mult *= 2
	end
	local amount = math.floor(n * mult)
	st.cash.Value += amount
	st.total += amount
end

local function spawnCoin(st, item, x)
	local coin = mk("Part", {
		Name = "Coin",
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(1.4, 1.4, 1.4),
		Position = Vector3.new(x, 6, -18),
		Color = item.Id == "Dropper3" and Color3.fromRGB(120, 230, 255) or Color3.fromRGB(255, 205, 40),
		Material = Enum.Material.Neon,
	}, plot)
	coin:SetAttribute("Value", item.Value)
	Debris:AddItem(coin, 25)
end

local function startDropper(st, item, x)
	task.spawn(function()
		while st.alive do
			task.wait(item.Interval)
			spawnCoin(st, item, x)
		end
	end)
end

collector.Touched:Connect(function(hit)
	if hit.Name == "Coin" and hit.Parent and not hit:GetAttribute("Done") then
		hit:SetAttribute("Done", true)
		local st = ownerState()
		if st then
			addCash(st, hit:GetAttribute("Value") or 1)
		end
		hit:Destroy()
	end
end)

local buttons = {}
local function applyItem(st, item, silent)
	st.owned[item.Id] = true
	if item.Kind == "Dropper" then
		local idx = #st.droppers
		local x = (idx - 1) * 2
		local d = mk("Part", { Name = item.Id, Size = Vector3.new(3, 3, 3), Position = Vector3.new(x, 3, -20), Anchored = true, Color = Color3.fromRGB(200, 90, 60) }, plot)
		startDropper(st, item, x)
		table.insert(st.droppers, d)
	elseif item.Kind == "Upgrade" then
		st.mult *= item.Mult
	elseif item.Kind == "Door" then
		local door = plot:FindFirstChild("VipDoor")
		if door then
			door.CanCollide = false
			door.Transparency = 0.8
		end
	end
	if buttons[item.Id] then
		buttons[item.Id].Part.Color = Color3.fromRGB(90, 90, 90)
		buttons[item.Id].Prompt.Enabled = false
	end
	if not silent then
		Remote:FireAllClients("bought", item.Id)
	end
end

mk("Part", { Name = "VipDoor", Size = Vector3.new(10, 8, 1), Position = Vector3.new(0, 4, 38), Anchored = true, Color = Color3.fromRGB(150, 60, 200) }, plot)

local function tryBuy(player, id)
	local st = states[player]
	if not st or typeof(id) ~= "string" then
		return false, "bad"
	end
	local item = Data.byId(id)
	if not item or st.owned[id] then
		return false, "owned"
	end
	if item.Requires and not st.owned[item.Requires] then
		return false, "locked"
	end
	if st.cash.Value < item.Cost then
		return false, "funds"
	end
	st.cash.Value -= item.Cost
	applyItem(st, item)
	return true
end

Buy.OnServerInvoke = tryBuy

-- build the buy buttons (world pads with ProximityPrompt)
for i, item in ipairs(Data.Items) do
	local pad = mk("Part", { Name = "Buy_" .. item.Id, Size = Vector3.new(6, 0.6, 6), Position = Vector3.new(-14 + (i - 1) * 7, 0.3, 12), Anchored = true, Color = Color3.fromRGB(60, 200, 90) }, plot)
	local bb = mk("BillboardGui", { Size = UDim2.new(0, 160, 0, 50), StudsOffset = Vector3.new(0, 3, 0), AlwaysOnTop = true }, pad)
	mk("TextLabel", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 0.3, BackgroundColor3 = Color3.new(0, 0, 0), TextColor3 = Color3.new(1, 1, 1), TextScaled = true, Text = item.Name .. "\n$" .. item.Cost }, bb)
	local pr = mk("ProximityPrompt", { ActionText = "Buy", ObjectText = item.Name, HoldDuration = 0, MaxActivationDistance = 10 }, pad)
	buttons[item.Id] = { Part = pad, Prompt = pr }
	pr.Triggered:Connect(function(player)
		local ok, why = tryBuy(player, item.Id)
		if not ok then
			Remote:FireClient(player, "denied", why)
		end
	end)
end

Players.PlayerAdded:Connect(function(player)
	local ls = mk("Folder", { Name = "leaderstats" }, player)
	local cash = mk("IntValue", { Name = "Cash", Value = Data.StartCash }, ls)
	local st = { cash = cash, mult = 1, owned = {}, droppers = {}, alive = true, total = 0, gamepass = false }
	states[player] = st
	local ok, saved = pcall(function()
		return store:GetAsync("u" .. player.UserId)
	end)
	if ok and saved then
		cash.Value = saved.cash or 0
		for id in pairs(saved.owned or {}) do
			local it = Data.byId(id)
			if it then
				applyItem(st, it, true)
			end
		end
	else
		applyItem(st, Data.Items[1], true)
	end
	local okp, has = pcall(function()
		return MarketplaceService:UserOwnsGamePassAsync(player.UserId, Data.GamepassId)
	end)
	st.gamepass = okp and has or false
	Remote:FireClient(player, "init", st.owned, st.gamepass)
	task.defer(function()
		Remote:FireClient(player, "init", st.owned, st.gamepass)
	end)
end)

Remote.OnServerEvent:Connect(function(player, action)
	if action == "buypass" then
		MarketplaceService:PromptGamePassPurchase(player, Data.GamepassId)
	elseif action == "buycash" then
		MarketplaceService:PromptProductPurchase(player, Data.ProductId)
	end
end)

MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, id, purchased)
	if id == Data.GamepassId and purchased and states[player] then
		states[player].gamepass = true
		Remote:FireClient(player, "pass", true)
	end
end)

MarketplaceService.ProcessReceipt = function(info)
	local player = Players:GetPlayerByUserId(info.PlayerId)
	if player and states[player] and info.ProductId == Data.ProductId then
		states[player].cash.Value += 2000
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end
	return Enum.ProductPurchaseDecision.NotProcessedYet
end

local function save(player)
	local st = states[player]
	if st then
		st.alive = false
		pcall(function()
			store:SetAsync("u" .. player.UserId, { cash = st.cash.Value, owned = st.owned })
		end)
	end
end
Players.PlayerRemoving:Connect(function(p)
	save(p)
	states[p] = nil
end)
game:BindToClose(function()
	for _, p in ipairs(Players:GetPlayers()) do
		save(p)
	end
end)
