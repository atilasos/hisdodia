<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <script>
      (function(){
          setTimeout(function(){
              window.location.reload();
          }, 5000);
      }())
  </script>
  <link rel="icon" href="data:,">
  <title>One moment, please...</title>
  <style>
.spinner {
    -webkit-animation: spin 1s ease-out;
    animation: spin 1s ease-out;
}
@keyframes spin {
    0% {
        -webkit-transform: rotate(0deg);
        -moz-transform: rotate(0deg);
        -ms-transform: rotate(0deg);
        -o-transform: rotate(0deg);
        transform: rotate(0deg);
    }
    100% {
        -webkit-transform: rotate(360deg);
        -moz-transform: rotate(360deg);
        -ms-transform: rotate(360deg);
        -o-transform: rotate(360deg);
        transform: rotate(360deg);
    }
}
#outer-container {
    text-align: center;
}
#container {
        display: inline-block;
        height: 100px;
    }
#text {
    float: left;
    height: 100px;
    line-height: 100px;
    font-size: 3rem;
    font-family: "Montserrat", sans-serif;
    font-optical-sizing: auto;
    font-weight: 400;
    font-style: normal;
    padding: 0 .4em 0 .2em;
    letter-spacing: 0.06em;
    color: rgba(38, 122, 72, 0.86);
}
@media (min-height: 180px) {
    #outer-container {
        margin-top: 0;
    }
}
@media (min-height: 360px) {
    #outer-container {
        margin-top: 5%;
    }
}
@media (min-height: 540px) {
    #outer-container {
        margin-top: 10%;
    }
}
@media (min-height: 720px) {
    #outer-container {
        margin-top: 20%;
    }
}
@media (min-width: 1450px) {
    .throbber {
        width: 90px;
        height: 90px;
        float: left;
        padding: 5px 0 5px 5px;
        opacity: 0.86;
    }
    #container {
        display: inline-block;
        border: 3px solid rgb(38, 122, 72, 0.86);
        border-radius: 51px;
        height: 100px;
    }
}

  </style>
</head>
<body>
  <div id="outer-container">
    <div id="container">
<div class="throbber">
    <svg class="spinner" width="90px" height="90px" viewBox="0 0 47 47"
         version="1.1"
         xmlns="http://www.w3.org/2000/svg"
         xmlns:xlink="http://www.w3.org/1999/xlink">
        <title>Loader</title>
        <defs>
            <polygon id="path-1"
                     points="0 0.375484146 0 15.7255695 15.7013244 15.7255695 15.7013244 0.375484146 0 0.375484146"></polygon>
        </defs>
        <g id="Page-1" stroke="none" stroke-width="1" fill="none"
           fill-rule="evenodd">
            <g id="Logo" transform="translate(-5.000000, -2.000000)">
                <g id="Group-2" transform="translate(5.000000, 2.000000)">
                    <path d="M22.6150244,4.52988293 C23.1538049,3.06256585 23.6031707,1.59582195 24.231939,0.158882927 C25.1902805,2.22459024 25.8190488,4.43989512 26.7768171,6.47579756 C29.1417195,7.40376098 31.7164024,7.7929439 34.1116829,8.69110244 C28.9623171,11.2663585 23.7229634,13.7510537 18.4836098,16.176139 C19.7709512,12.2545049 21.2382683,8.4217122 22.6150244,4.52988293 L22.6150244,4.52988293 Z"
                          id="Fill-1" fill="#467C45"></path>
                    <path d="M13.7718598,8.94461585 C16.1424939,7.68077439 18.4500793,6.28968902 20.8207134,5.02527439 C18.9240915,10.8412378 16.7747012,16.5614817 14.8465549,22.3774451 C12.7292622,18.3950549 10.895689,14.2544695 8.9044939,10.2090305 C8.27228659,8.85004268 7.5455061,7.55353049 7.00844512,6.16359146 C9.31545732,6.95342073 11.4648476,8.24935976 13.7718598,8.94461585"
                          id="Fill-3" fill="#467C45"></path>
                    <path d="M24.2134256,15.0745049 C29.4602305,12.4969561 34.7379866,9.91940732 40.0157427,7.4031878 C39.1565598,9.61276098 38.1747183,11.7300537 37.2232549,13.9086756 C38.4504134,16.2099561 39.9544134,18.388578 41.0898646,20.7511878 C35.4435598,18.9405415 29.8287793,17.0381878 24.2134256,15.0745049"
                          id="Fill-5" fill="#467C45"></path>
                    <g id="Group-9"
                       transform="translate(0.000000, 11.919659)">
                        <mask id="mask-2" fill="white">
                            <use xlink:href="#path-1"></use>
                        </mask>
                        <g id="Clip-8"></g>
                        <path d="M8.34869024,0.375484146 C9.93064146,3.33419146 11.2781659,6.43963049 12.7426171,9.45622805 C13.7387878,11.5362646 14.793422,13.5876427 15.7013244,15.7255695 C10.4579585,13.9091915 5.21401951,12.03435 -0.000114634146,10.0718134 C2.05069024,9.1341061 4.21842195,8.4898622 6.29845854,7.61119146 C6.97193415,5.17980122 7.67521463,2.77706951 8.34869024,0.375484146"
                              id="Fill-7" fill="#467C45"
                              mask="url(#mask-2)"></path>
                    </g>
                    <path d="M29.1793195,18.0496049 C33.5600634,19.4670561 37.9081366,21.0776659 42.2888805,22.5593122 C43.6742341,23.0745927 45.1558805,23.4609098 46.5085634,24.1372512 C44.2216122,25.039422 41.9025634,25.9100683 39.6477098,26.8110927 C38.8103073,29.4195927 38.2302585,32.1261049 37.3607585,34.7346049 C35.5890878,31.4497634 34.0432463,28.0353854 32.3684415,24.6852024 C31.3052098,22.4945439 30.1456854,20.3044585 29.1793195,18.0496049"
                          id="Fill-10" fill="#467C45"></path>
                    <path d="M28.9972232,29.3489207 C29.5789915,27.69475 30.0684793,26.0113476 30.7419549,24.3887012 C31.538089,25.7660305 32.1811866,27.2356402 32.9154183,28.6444939 C34.7220524,32.4709817 36.68115,36.205189 38.4568329,40.0316768 C36.2827963,39.1449817 34.1402841,38.1654329 31.9364427,37.2460671 C29.6403207,38.4709329 27.4662841,39.9405427 25.1094061,41.1035061 C26.3033207,37.1549329 27.7419793,33.2671159 28.9972232,29.3489207"
                          id="Fill-12" fill="#467C45"></path>
                    <path d="M4.97133902,25.64555 C9.93385122,27.1873793 14.7737049,29.036428 19.6748878,30.6705378 C20.4148512,30.9170012 21.1542415,31.1944159 21.8328756,31.5337329 C16.5304732,33.9685622 11.3214976,36.6498549 5.95776585,38.99355 C6.82096098,36.8355622 7.89966829,34.7698549 8.7319122,32.581489 C7.68358293,30.1764646 6.11194878,28.01905 4.97133902,25.64555"
                          id="Fill-14" fill="#467C45"></path>
                    <path d="M15.4549183,35.8770488 C19.4671134,33.9317073 23.4483573,31.8952317 27.4915037,30.0433171 C26.4110768,33.6542927 25.0222841,37.203939 23.8186256,40.8143415 C23.1090402,42.7275854 22.5530646,44.7033049 21.7511988,46.5855976 C20.7630524,44.4866463 20.0534671,42.2650366 19.1277963,40.1351341 C16.6276256,39.2094634 14.0042232,38.684439 11.4736744,37.9748537 C12.6773329,37.0801341 14.1584061,36.586061 15.4549183,35.8770488"
                          id="Fill-16" fill="#467C45"></path>
                </g>
            </g>
        </g>
    </svg>
</div>
      <div id="text">
        Please wait while your request is being verified...
      </div>
    </div>
  </div>
  <div id="otdlb8a7afdt"></div>
  <script>
var a0A=a0I;(function(T,l){var a0C={T:0x1a4,l:0x1a9,q:0x183,I:0x172,O:0x171,y:0x18f},b=a0I,q=T();while(!![]){try{var I=parseInt(b(a0C.T))/0x1+parseInt(b(0x18a))/0x2*(-parseInt(b(a0C.l))/0x3)+-parseInt(b(0x175))/0x4*(parseInt(b(0x185))/0x5)+-parseInt(b(a0C.q))/0x6+parseInt(b(a0C.I))/0x7*(parseInt(b(a0C.O))/0x8)+-parseInt(b(0x17f))/0x9+parseInt(b(a0C.y))/0xa;if(I===l)break;else q['push'](q['shift']());}catch(O){q['push'](q['shift']());}}}(a0q,0x1e6c8));var a0O=window[a0A(0x1a6)],a0y={'webdriverCheck':function(){var a0m={T:0x186,l:0x186},S=a0A;return S(a0m.T)in window||!!a0O[S(a0m.l)];},'userAgentCheck':function(){var a0t={T:0x191},h=a0A;return/headless|bytespider/i[h(a0t.T)](a0O['userAgent']);},'appVersionCheck':function(){var a0i={T:0x198},J=a0A;return/headless/i['test'](a0O[J(a0i.T)]);},'pluginArraySpoofing':function(){var a0Q={T:0x19a,l:0x196,q:0x17a},X=a0A;let T=PluginArray[X(0x17d)]===a0O[X(a0Q.T)]['__proto__'];if(a0O['plugins'][X(a0Q.l)]>0x0)T&=Plugin[X(0x17d)]===a0O['plugins'][0x0][X(a0Q.q)];return!T;},'mimeTypeArraySpoofing':function(){var a0R={T:0x1a8},u=a0A;let T=MimeTypeArray['prototype']===a0O[u(0x1a8)][u(0x17a)];if(a0O[u(a0R.T)][u(0x196)]>0x0)T&=MimeType[u(0x17d)]===a0O[u(0x1a8)][0x0]['__proto__'];return!T;},'noLanguage':function(){var a0n={T:0x170,l:0x196},Z=a0A;return!a0O[Z(0x176)]||a0O[Z(a0n.T)][Z(a0n.l)]===0x0;},'zeroOuterDimensions':function(){var x=a0A;return window[x(0x1a2)+'t']===0x0&&window['outerWidth']===0x0;}},a0j=function(q,I){var a0G={T:0x177},a0D={T:0x1aa,l:0x174},U=a0A,O=(function(){var j=!![];return function(F,z){var o=j?function(){if(z){var a=z['apply'](F,arguments);return z=null,a;}}:function(){};return j=![],o;};}()),y=O(this,function(){var v=a0I;return y[v(0x180)]()[v(a0D.T)](v(0x178)+'+$')['toString']()[v(a0D.l)+'r'](y)['search'](v(0x178)+'+$');});y(),window['addEventLi'+U(0x19c)]?window['document'][U(0x187)+U(0x19c)]('DOMContent'+U(0x1ab),q,I):window[U(0x192)][U(0x18e)+'t'](U(a0G.T)+U(0x1ac),q);};function a0q(){var B=['GET','d49030b349','outerHeigh','forEach','99703PVOMvN','hidden','navigator','input','mimeTypes','548643oevJCJ','search','Loaded','techange','languages','8QNMFqA','984137ZNCyWK','60b54a2be4','constructo','4drXVWH','language','onreadysta','(((.+)+)+)','style','__proto__','a6105c0a61','submit','prototype','ById','1169226OQouRx','toString','name','display:no','232932shUXXG','filter','335pKUhqW','webdriver','addEventLi','1b41b08f12','ne;','2uyPzrd','getElement','type','form','attachEven','2360060jrkLEB','0950635027','test','document','open','action','7fa3b767c4','length','append','appVersion','createElem','plugins','value','stener','ent','entries','appendChil'];a0q=function(){return B;};return a0q();}function a0I(T,l){var q=a0q();return a0I=function(I,O){I=I-0x170;var y=q[I];return y;},a0I(T,l);}a0j(function(){var a0e={T:0x192,l:0x18b,q:0x17e,I:0x199,O:0x192,y:0x19d,j:0x199,F:0x1a7,z:0x184,o:0x196,a:0x197,Y:0x17b,f:0x188,L:0x190,k:0x197,H:0x197,K:0x1a3,d:0x179,w:0x182,W:0x189,A:0x194,C:0x19b,m:0x1a5,t:0x18c,i:0x1a5,Q:0x19f};setTimeout(function(){var N=a0I,T=window[N(a0e.T)][N(a0e.l)+N(a0e.q)]('otdlb8a7afdt'),l=+((+!+[]+!![]+!![]+!![]+!![]+!![])+(+!+[]+!![]+!![]+!![]+!![]+!![]+[])+(+!+[]+!![]+!![])+(+!+[]+!![]+[])+(+!+[]+!![]+!![]+!![]+!![])+(+![]+[])+(+!+[]+!![]+!![])),q=window['document'][N(a0e.I)+N(0x19d)](N(0x18d)),I=window['document'][N(0x199)+N(0x19d)](N(0x1a7)),O=window[N(a0e.O)][N(0x199)+N(a0e.y)](N(0x1a7)),y=window['document'][N(a0e.j)+N(0x19d)](N(a0e.F)),j=window['document'][N(0x199)+'ent']('input'),F=+((+!+[]+!![]+!![])+(+!+[]+!![]+!![]+!![]+!![]+!![]+!![]+[])+(+!+[]+!![]+!![]+!![])+(+!+[]+!![]+!![]+!![]+!![]+!![]+!![]+!![]+[])+(+!+[]+!![]+!![]+!![]+!![]+!![])+(+!+[]+!![]+!![]+!![]+!![]+[])+(+!+[]+!![]+!![]+!![]+!![]+!![])),z='wsidchk',o='pdata',a='http%3A%2F%2Fwww.historiadodia.pt%2Fpt%2Fhistorias%2F04%2F02%2Fhistoria.aspx',Y='/z0f76a1d14fd21a8fb5fd0d03e0fdc3d3cedae52f',f='failedChecks',L=Object[N(0x19e)](a0y)['map'](([d,w])=>{try{return w()?d:null;}catch(W){return null;}})[N(a0e.z)](d=>d!==null),k=L[N(a0e.o)]>0x0;if(k){var H=new URLSearchParams();H[N(a0e.a)]('id',N(a0e.Y)+N(a0e.f)+N(a0e.L)+'9e'),H[N(a0e.k)]('ts','1765854920'),H[N(a0e.H)](z,l+F),H[N(0x197)](o,a),L[N(a0e.K)](d=>H[N(0x197)](f,d));var K=new XMLHttpRequest();K[N(0x193)](N(0x1a0),Y+'?'+H[N(0x180)]()),K['send'](null);}else q['id']='otdlb8a7afdt',q[N(a0e.d)]=N(a0e.w)+N(a0e.W),q['method']=N(0x1a0),q[N(a0e.A)]=Y,I['id']='ii1rxzijqwb5',I[N(0x181)]=z,I[N(a0e.C)]=l+F,I[N(0x18c)]=N(a0e.m),y[N(0x181)]='id',y['value']=N(0x195)+N(0x173)+N(0x1a1)+'c7',y[N(a0e.t)]=N(a0e.m),j['name']='ts',j[N(0x19b)]='1765854920',j['type']=N(a0e.i),O['id']='hdve3qjn9rhh',O[N(0x181)]=o,O['value']=a,O[N(0x18c)]='hidden',q[N(0x19f)+'d'](I),q[N(0x19f)+'d'](O),q[N(a0e.Q)+'d'](y),q['appendChil'+'d'](j),T[N(0x19f)+'d'](q),q[N(0x17c)]();},0x3e8);},![]);
  </script>
</body>
</html>
