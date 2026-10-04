local TycoonData = {}
TycoonData.GamepassId = 7001
TycoonData.ProductId = 8001
TycoonData.StartCash = 0
-- Items are bought in order; "Dropper" items spawn coins, "Upgrade" increases value
TycoonData.Items = {
	{ Id = "Dropper1", Name = "Coin Dropper", Cost = 0, Kind = "Dropper", Value = 5, Interval = 2 },
	{ Id = "Dropper2", Name = "Gold Dropper", Cost = 100, Kind = "Dropper", Value = 15, Interval = 1.5, Requires = "Dropper1" },
	{ Id = "Upgrade1", Name = "Polisher (x2 value)", Cost = 250, Kind = "Upgrade", Mult = 2, Requires = "Dropper1" },
	{ Id = "Dropper3", Name = "Diamond Dropper", Cost = 800, Kind = "Dropper", Value = 60, Interval = 1.2, Requires = "Dropper2" },
	{ Id = "Door", Name = "VIP Door", Cost = 1500, Kind = "Door", Requires = "Dropper3" },
}
function TycoonData.byId(id)
	for _, it in ipairs(TycoonData.Items) do
		if it.Id == id then
			return it
		end
	end
	return nil
end
return TycoonData
