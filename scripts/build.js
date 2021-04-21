const {
  readFileSync,
  writeJSONSync,
  writeFileSync,
  existsSync,
  mkdirpSync,
  copySync,
} = require('fs-extra');
const { resolve, relative, join, extname, dirname } = require('path')
const { sync: resolvePathSync } = require('resolve')
const compiler = require('jsx-compiler')
const { parseCode, getImported } = require('jsx-compiler/src/parser')
const { transformSync } = require('@babel/core');
const renameImportBabelPlugin = require('jsx2mp-loader/src/babel-plugin-rename-import')

const CWD = process.cwd()
const rootNodeModulePath = join(CWD, 'node_modules');
const platform = {
  type: 'bytedance',
  name: 'ByteDance MicroApp',
  extension: {
    xml: '.ttml',
    css: '.ttss'
  }
}

function isFromNodeModule(path) {
  return path.indexOf(rootNodeModulePath) === 0;
}

function normalizeNpmFileName(filename) {
  const repalcePathname = pathname => pathname.replace(/@/g, '_').replace(/node_modules/g, 'npm');

  const cwd = process.cwd();

  if (!filename.includes(cwd)) return repalcePathname(filename);

  // Support for `@` in cwd path
  const relativePath = relative(cwd, filename);
  return join(cwd, repalcePathname(relativePath));
}

function removeExt(url) {
  const ext = extname(url)
  return url.replace(ext, '')
}

function output(content, paths) {
  const { code, json, template, css, config, assets } = content
  if (code) {
    writeFileWithDirCheck(paths.code, code);
  }
  if (json) {
    writeFileWithDirCheck(paths.json, json, 'json');
  }
  if (template) {
    writeFileWithDirCheck(paths.template, template);
  }
  if (css) {
    writeFileWithDirCheck(paths.css, css);
  }
  if (config) {
    writeFileWithDirCheck(paths.config, config);
  }
  if (assets) {
    Object.keys(assets).forEach((asset) => {
      const content = assets[asset];
      const assetsOutputPath = join(paths.assets, asset);
      writeFileWithDirCheck(assetsOutputPath, content);
    });
  }
}

function writeFileWithDirCheck(filePath, content, type = 'file') {
  const dirPath = dirname(filePath);
  if (!existsSync(dirPath)) {
    mkdirpSync(dirPath);
  }
  if (type === 'file') {
    writeFileSync(filePath, content);
  } else if (type === 'json') {
    writeJSONSync(filePath, content, { spaces: 2 });
  }
}

function resolvePath(basedir, id) {
  return resolvePathSync(id, {
    basedir,
    extensions: ['.js', '.jsx'],
  })
}

async function buildMini({ type, src, resource, dist }) {
  const content = readFileSync(resource, 'utf-8')

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
  output(outputContent, outputPaths)

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
  Object.keys(transformed.imported).forEach(name => {
    const depsPath = resolvePath(dirname(resource), name);
    if (isCustomComponent(name, transformed.usingComponents)) {
      buildMini({
        type: 'component',
        src,
        resource: depsPath,
        dist,
      })
    } else if (extname(depsPath) === '.js') {
      buildScript({
        src,
        resource: depsPath,
        dist,
      })
    } else {
      buildAsset({
        src,
        resource: depsPath,
        dist,
      })
    }
  });
}

function buildScript({ src, resource, dist }) {
  const content = readFileSync(resource, 'utf-8')
  let distSourcePath
  if (isFromNodeModule(resource)) {
    distSourcePath = normalizeNpmFileName(join(dist, 'npm', relative(rootNodeModulePath, resource)));
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
  output({ code }, { code: distSourcePath })

  // recersive
  const ast = parseCode(content)
  const imported = getImported(ast, {}, resource)
  Object.keys(imported).forEach(name => {
    const depsPath = resolvePath(dirname(resource), name);
    if (extname(depsPath) === '.js') {
      buildScript({
        src,
        resource: depsPath,
        dist,
      })
    } else {
      buildAsset({
        src,
        resource: depsPath,
        dist,
      })
    }
  });
}

function buildAsset({ src, resource, dist }) {
  const distSourcePath = join(dist, relative(src, resource))
  copySync(resource, distSourcePath);
}

function buildRuntime({ dist, resource }) {
  const distSourcePath = normalizeNpmFileName(join(dist, 'npm', 'jsx2mp-runtime.js'))
  copySync(resource, distSourcePath);
}

function main({ src, pages, dist }) {
  pages.forEach((page) => {
    buildMini({
      type: 'page',
      src,
      resource: resolvePath(src, page),
      dist: resolve(CWD, dist),
    })
  })
  buildRuntime({
    dist,
    resource: require.resolve('jsx2mp-runtime/dist/jsx2mp-runtime.bytedance.esm.js'),
  })
}

main({
  src: resolve(CWD, './src'),
  pages: [
    './pages/Home/index',
    './pages/About/index',
  ],
  dist: 'raw-dist',
})
