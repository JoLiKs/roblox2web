-- geo: ?country=RU&lang=ru
-- LocalizationService в эмуляторе: страна из geo.js (здесь ?country=RU), LocaleId из ?lang / navigator.language
local Players = game:GetService("Players")
local LS = game:GetService("LocalizationService")
local function check(c, name)
	print((if c then "OK " else "FAIL ") .. name)
end
local function onPlayer(p)
	local ok, country = pcall(function()
		return LS:GetCountryRegionForPlayerAsync(p)
	end)
	check(ok and country == "RU", "GetCountryRegionForPlayerAsync -> RU (" .. tostring(country) .. ")")
	check(p.LocaleId == "ru-ru", "Player.LocaleId from ?lang=ru (" .. tostring(p.LocaleId) .. ")")
	check(LS.RobloxLocaleId == "ru-ru", "LocalizationService.RobloxLocaleId")
	print("DONE")
end
for _, p in ipairs(Players:GetPlayers()) do
	task.spawn(onPlayer, p)
end
Players.PlayerAdded:Connect(onPlayer)
