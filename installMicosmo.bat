rem Manually install the micosmo packages to the node_modules
rem Assumes that the micosmo package directory is in the same location as target project directory
xcopy /q /s /e /i /d /y \repos\miaframe node_modules\@micosmo\aframe /EXCLUDE:xcopy.exclude
xcopy /q /s /e /i /d /y \repos\micore node_modules\@micosmo\aframe\node_modules\@micosmo\core /EXCLUDE:xcopy.exclude
xcopy /q /s /e /i /d /y \repos\miasync node_modules\@micosmo\aframe\node_modules\@micosmo\async /EXCLUDE:xcopy.exclude
xcopy /q /s /e /i /d /y \repos\micore node_modules\@micosmo\aframe\node_modules\@micosmo\async\node_modules\@micosmo\core /EXCLUDE:xcopy.exclude

xcopy /q /s /e /i /d /y \repos\micore node_modules\@micosmo\core /EXCLUDE:xcopy.exclude

xcopy /q /s /e /i /d /y \repos\miticker node_modules\@micosmo\ticker /EXCLUDE:xcopy.exclude
xcopy /q /s /e /i /d /y \repos\micore node_modules\@micosmo\ticker\node_modules\@micosmo\core /EXCLUDE:xcopy.exclude

xcopy /q /s /e /i /d /y \repos\miasync node_modules\@micosmo\async /EXCLUDE:xcopy.exclude
xcopy /q /s /e /i /d /y \repos\micore node_modules\@micosmo\async\node_modules\@micosmo\core /EXCLUDE:xcopy.exclude
