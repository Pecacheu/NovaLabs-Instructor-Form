import build from 'raiutils/build';

build.setOpts({
	app: 'form.ts',
	srcCli: 'web',
	srcSrv: 'srv',
	jsMin: {...build.defaults.jsMin, ecma: 2025}
});

await build.run();