const {
  readFile,
  writeJSON,
  writeFile,
  pathExists,
  mkdirp,
  copy,
} = require('fs-extra');
const esbuild = require('esbuild')
const { resolve, join, dirname, extname, relative } = require('path')
const { sync: resolvePathSync } = require('resolve')
const compiler = require('jsx-compiler')
const renameImportBabelPlugin = require('jsx2mp-loader/src/babel-plugin-rename-import')
const { transformSync } = require('@babel/core');

const platform = {
  type: 'bytedance',
  name: 'ByteDance MicroApp',
  extension: {
    xml: '.ttml',
    css: '.ttss'
  }
}

function resolvePath(basedir, id) {
  return resolvePathSync(id, {
    basedir,
    extensions: ['.js', '.jsx'],
  })
}

async function output(content, paths) {
  const { code, json, template, css, config, assets } = content
  if (code) {
    await writeFileWithDirCheck(paths.code, code);
  }
  if (json) {
    await writeFileWithDirCheck(paths.json, json, 'json');
  }
  if (template) {
    await writeFileWithDirCheck(paths.template, template);
  }
  if (css) {
    await writeFileWithDirCheck(paths.css, css);
  }
  if (config) {
    await writeFileWithDirCheck(paths.config, config);
  }
  if (assets) {
    Object.keys(assets).forEach(async (asset) => {
      const content = assets[asset];
      const assetsOutputPath = join(paths.assets, asset);
      await writeFileWithDirCheck(assetsOutputPath, content);
    });
  }
}

async function writeFileWithDirCheck(filePath, content, type = 'file') {
  const dirPath = dirname(filePath);
  if (!(await pathExists(dirPath))) {
    await mkdirp(dirPath);
  }
  if (type === 'file') {
    await writeFile(filePath, content);
  } else if (type === 'json') {
    await writeJSON(filePath, content, { spaces: 2 });
  }
}

function removeExt(url) {
  const ext = extname(url)
  return url.replace(ext, '')
}

function normalizeNpmFileName(filename) {
  const cwd = process.cwd();
  const repalcePathname = pathname => pathname.replace(/@/g, '_').replace(/node_modules/g, 'npm');
  if (!filename.includes(cwd)) return repalcePathname(filename);
  // Support for `@` in cwd path
  const relativePath = relative(cwd, filename);
  return join(cwd, repalcePathname(relativePath));
}

function isFromNodeModule(path, rootNodeModulePath) {
  return path.indexOf(rootNodeModulePath) === 0;
}

function raxAssetPlugin({ filter, cwd = process.cwd() } = {}) {
  return {
    name: 'rax-asset',
    setup(build) {
      const { outdir } = build.initialOptions
      const dist = resolve(cwd, outdir)
      const src = resolve(cwd, 'src')

      build.onLoad({ filter: /\.png$/ }, async (args) => {
        const { path: resource } = args
        const distSourcePath = join(dist, relative(src, resource))
        await copy(resource, distSourcePath);
        return { loader: 'file' }
      })
    },
  }
}

function raxScriptPlugin({ cwd = process.cwd() } = {}) {
  return {
    name: 'rax-script',
    setup(build) {
      const { outdir } = build.initialOptions
      const dist = resolve(cwd, outdir)
      const src = resolve(cwd, 'src')
      const nodeModules = resolve(cwd, 'node_modules')

      build.onLoad({ filter: /\.js$/ }, async (args) => {
        const { path: resource } = args
        const content = await readFile(resource, 'utf-8')

        let distSourcePath
        if (isFromNodeModule(resource, nodeModules)) {
          distSourcePath = normalizeNpmFileName(join(dist, 'npm', relative(nodeModules, resource)));
        } else {
          distSourcePath = join(dist, relative(src, resource))
        }
        const { code } = transformSync(content, {
          plugins: [
            [renameImportBabelPlugin, {
              normalizeNpmFileName,
              distSourcePath,
              resourcePath: resource,
              outputPath: dist,
              disableCopyNpm: false,
              platform,
            }]
          ]
        })
        await output({ code }, { code: distSourcePath })

        return {}
      })
    },
  }
}

function raxMiniPlugin({ cwd = process.cwd() } = {}) {
  return {
    name: 'rax-mini',
    setup(build) {
      const { entryPoints, outdir } = build.initialOptions
      const dist = resolve(cwd, outdir)
      const src = resolve(cwd, 'src')

      build.onResolve({ filter: /\.jsx?$/ }, (args) => {
        const { path } = args
        if (entryPoints.includes(path)) {
          return {
            path: `${resolvePath(args.resolveDir, path)}?page`,
            namespace: 'rax-mini-ns',
          }
        }
        return {}
      })

      build.onResolve({ filter: /\?component$/ }, (args) => {
        const [resource] = args.path.split('?')
        return {
          path: `${resolvePath(args.resolveDir, resource)}?component`,
          namespace: 'rax-mini-ns',
        }
      })

      build.onLoad({ filter: /.*/, namespace: 'rax-mini-ns' }, async (args) => {
        const { path } = args
        const [resource, type] = path.split('?')
        const content = await readFile(resource, 'utf-8')

        // compile
        const transformed = compiler(content, {
          ...compiler.baseOptions,
          type,
          outputPath: dist,
          sourcePath: src,
          resourcePath: resource,
          platform,
          sourceFileName: resource,
        })

        // output files
        const outputContent = {
          code: transformed.code,
          map: transformed.map,
          css: transformed.style || '',
          json: transformed.config,
          template: transformed.template,
          assets: transformed.assets
        };
        const distFileWithoutExt = removeExt(join(dist, relative(src, resource)))
        const outputPaths = {
          code: distFileWithoutExt + '.js',
          json: distFileWithoutExt + '.json',
          css: distFileWithoutExt + platform.extension.css,
          template: distFileWithoutExt + platform.extension.xml,
          assets: dist
        };
        await output(outputContent, outputPaths)

        // recersive
        function isCustomComponent(name, usingComponents = {}) {
          const componentPath = join(dirname(resource), name);
          for (let key in usingComponents) {
            if (
              usingComponents.hasOwnProperty(key) &&
              usingComponents[key].indexOf(componentPath) === 0
            ) {
              return true;
            }
          }
          return false;
        }
        const imports = Object.keys(transformed.imported).map((name) => {
          if (isCustomComponent(name, transformed.usingComponents)) {
            return `import '${name}?component'`
          }
          return `import '${name}'`
        }).join('\n')
        return { contents: imports, resolveDir: dirname(resource) }
      })
    }
  }
}

const CWD = process.cwd()
const OUTDIR_NAME = 'es-dist'

esbuild.build({
  entryPoints: [
    './src/pages/Home/index.jsx',
    './src/pages/About/index.jsx',
  ],
  bundle: true,
  write: false,
  outdir: OUTDIR_NAME,
  loader: { '.png': 'file' },
  plugins: [
    raxMiniPlugin({ cwd: CWD }),
    raxScriptPlugin({ cwd: CWD }),
    raxAssetPlugin({ filter: /\.png|jpe?g|webp|mp4$/, cwd: CWD }),
  ],
}).then(() => {
  const dist = resolve(CWD, OUTDIR_NAME)
  const distSourcePath = normalizeNpmFileName(join(dist, 'npm', 'jsx2mp-runtime.js'))
  const resource = require.resolve('jsx2mp-runtime/dist/jsx2mp-runtime.bytedance.esm.js')
  return copy(resource, distSourcePath);
})
